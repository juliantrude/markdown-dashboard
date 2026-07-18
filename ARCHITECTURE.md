# ARCHITECTURE — md-dashboard

Module overview and live-reload flow for **md-dashboard**. This describes the
target architecture from the `GOAL.md` plan; modules not yet built are marked
**(planned)**.

## Modules

- **`src/cli.ts`** (present) — entrypoint for `md-dashboard <file.md|folder>`.
  Parses argv (`--port`, `--no-open`), then branches on whether the target
  path is a file or a directory (Increment 13): a file must be `.md` and
  becomes a single-entry `DiscoveredFile[]` (`id` = its basename); a
  directory is handed to `src/server/discover.ts`'s `discoverMarkdownFiles`
  and errors out if it contains none. Either way the result is a
  `DiscoveredFile[]` passed to `startServer` — single-file mode is just
  folder mode with one file, not a separate code path. Starts the HTTP
  server, opens the default browser at the served URL. Compiled separately
  from the browser bundle (see Build below) and invoked via
  `bin/md-dashboard.js`.
- **`src/server/discover.ts`** (present, Increment 13) — `discoverMarkdownFiles(rootDir)`
  recursively walks a directory (skipping dotfiles/dirs and `node_modules`)
  and returns every `.md` file as `{ id, absPath }`, `id` being the
  forward-slashed path relative to `rootDir` (used as the file's identifier
  in the WS protocol and as its sidebar label) — sorted by `id` so sidebar
  order is stable across restarts. The file set is fixed at CLI startup;
  files added to the folder afterward are not picked up (out of scope for
  this increment, noted as a deliberate limit, not an oversight).
- **`src/server/server.ts`** (present) — local HTTP server that serves the
  built dashboard shell (`dist/index.html` + assets) and confirms every
  target Markdown file is readable. Also runs a `ws` `WebSocketServer` on the
  `/ws` path of the same HTTP server. On connection it sends a
  `{ type: 'files', files: string[] }` message (every discovered file's
  `id`, one entry in single-file mode too) followed by one
  `{ type: 'content', file: string, title: string, cards: Card[] }` message
  per file (Increment 13 renamed this from the old single-document payload,
  which had no `file` field). On a watched file's change, only that file's
  fresh `content` message is broadcast to every open socket — the client
  keeps its own cache of every file's last-pushed document (see
  `src/main.ts` below) so a sidebar switch never needs a round trip.
  `title`/`cards` come straight from `src/parser/parse.ts`; `Card` is
  `{ heading, html, markdownHtml, table?, chartTypes?, tasks?, kpi?, metric?,
  mermaid?, chartFence? }`
  (`table`/`chartTypes` only present when the card's first table yields
  chartable data — see `src/parser/table.ts` below; `tasks` only present when
  the card contains `- [ ]`/`- [x]` items — see `src/parser/tasklist.ts`
  below; `kpi`/`metric` only present for a numeric list / lone `Metric: value`
  line respectively, mutually exclusive — see `src/parser/kpi.ts` below;
  `mermaid` only present for a ```` ```mermaid ```` fence and `chartFence`
  only present for a valid ```` ```chart ```` fence — see `src/parser/mermaid.ts`
  and `src/parser/chartfence.ts` below). `parseDocument` is wrapped in a
  `safeParse` that catches and logs rather than propagating (Increment 11):
  the target file is user input edited outside this process, a system
  boundary, so a parse failure (or a read mid-save) must never crash the
  server or the watcher — on failure, no message is sent and whatever was
  last broadcast for that file keeps showing. A well-formed but section-less
  document (no `##` cards) is not an error — it's sent normally with
  `cards: []`, and the client renders a friendly empty state instead of a
  blank grid. Never writes to any target file.
- **`src/server/open-browser.ts`** (present) — best-effort cross-platform
  "open the default URL in the browser", swallowing failures (headless/CI
  environments) since the URL is always printed too.
- **`src/server/watch.ts`** (present) — wraps `chokidar` (pinned to v4;
  v5 requires Node ≥20.19 and this machine runs Node 18.19.1) to watch a
  fixed list of `.md` file paths (Increment 13 renamed `watchFile` to
  `watchFiles` and generalized it from one path to an array — chokidar
  accepts either natively) and invokes a callback with the changed file's
  absolute path and fresh content on `change` and `add` (editors that save
  atomically emit `unlink`+`add` instead of `change`), with
  `awaitWriteFinish` so partial writes are never read.
- **`src/parser/parse.ts`** (present) — wraps `markdown-it` (`html: false`) to
  parse the file into a token stream, then splits on `##` boundaries into an
  ordered list of `Card` models, rendered via `md.renderer.render` on that
  section's tokens. The first `#` heading becomes `title`, not a card;
  content before the first `##` (other than that title) is dropped — every
  card lives under a `##` boundary. Each card carries **two** renders:
  `html` (the default widget — plain markdown-it output; per-type widgets
  beyond the table case replace this in Increments 8–10) and `markdownHtml`
  (the faithful "Markdown" raw-render mode from `ELEMENTS.md` — same tokens,
  rendered a second time after `markCheckboxes()` mutates `- [ ]`/`- [x]`
  list items into real, disabled `<input type="checkbox">` elements). `html`
  is always rendered *before* the mutation runs, since both renders share one
  token array. It also calls `src/parser/table.ts`'s `extractTableData`,
  `src/parser/tasklist.ts`'s `extractTaskItems`, and (Increment 9)
  `src/parser/kpi.ts`'s `extractKpiListItems`/`extractSingleMetric` on the
  same (pre-mutation) tokens, to look for the card's first table, any
  task-list items, and a numeric list / lone metric line respectively — all
  must run before `markCheckboxes` for the same reason.
- **`src/parser/table.ts`** (present, Increment 7) — server-side table→chart
  extraction. `extractTableData` walks a card's token stream for the first
  `table_open`…`table_close` block, takes the first column as `categories`
  and every other column as a numeric `series` only if *every* row in that
  column parses as a number (`ELEMENTS.md`: "only alternatives valid for the
  data shape" — a single non-numeric cell drops that whole column). Only the
  card's first table drives its chart widget; a second table in the same
  card is not currently supported. `validChartTypes(table)` then decides
  which of the nine `ChartType`s in `ELEMENTS.md` fit that shape — rules
  decided in Increment 7 (no prior source to follow):
  - `bar` — single-series only (a multi-series table must pick grouped or
    stacked rather than collapsing to one series).
  - `bar-grouped` / `bar-stacked` — need 2+ numeric series.
  - `line` / `area` — need 2+ categories (a single point isn't a trend).
  - `pie` / `donut` — single-series only, need 2+ categories.
  - `radar` — needs 3+ categories (axes).
  - `scatter` — needs 2+ numeric series (only the first two are plotted,
    as an x/y pair).
- **`src/parser/tasklist.ts`** (present, Increment 8) — server-side
  task-list extraction. `extractTaskItems` scans a card's token stream for
  every `inline` token whose raw source starts with a `- [ ]`/`- [x]`
  marker (same regex as `markCheckboxes`, run first on the unmutated
  tokens) and returns `{ html, done }[]` — `html` is the item's label
  re-rendered via `md.renderInline` (so bold/links/etc. survive), marker
  stripped; `done` from the bracket's `x`/`X`. Items are collected wherever
  they appear in the card (nesting isn't distinguished), and the function
  returns `undefined` rather than an empty array when the card has none, so
  `Card.tasks` can double as the "does this card have a task list" check.
- **`src/widgets/tasklist-view.ts`** (present, Increment 8) — client-side
  progress-bar/donut rendering for `Card.tasks`. `taskProgress` computes
  `{ done, total, percent }`; `taskDonutData` reshapes that into a
  two-category `TableData` (`Done`/`Open` counts) so the donut view can
  reuse `chart-view.ts`'s existing `mountChart(..., 'donut')` builder rather
  than a bespoke chart config — the categorical palette's slot 1/2 colors
  the two segments, same as any other donut. `renderTaskItemsHtml` renders
  the same per-item checklist (real, disabled checkboxes) under both the bar
  and donut views, since `ELEMENTS.md` requires each milestone's individual
  done/open state to stay visible alongside the aggregate, never a bare
  percentage.
- **`src/parser/kpi.ts`** (present, Increment 9) — server-side numeric-list /
  single-metric extraction, both built on one `Key: value` regex
  (`^(.+?):\s*([+-]?[\d,]+(?:\.\d+)?)(%)?\s*$`, trailing `%` tracked so the
  widget can decide formatting/gauge-max later). `extractKpiListItems` scans a
  card's first bullet/ordered list; every item must match the regex or the
  whole list is rejected (`undefined`) — falls back to the plain List default
  render, per `ELEMENTS.md`'s "only alternatives valid for the data shape".
  `extractSingleMetric` only fires when the card has **no** list and **exactly
  one** `inline` token total (a table cell or an extra prose paragraph both
  disqualify it) — this is `ELEMENTS.md`'s "Single large number / Metric: 42"
  element, the first one whose *default* widget isn't the plain markdown-it
  render (see `src/main.ts` below). `parse.ts`'s `flush()` tries the list shape
  first and only tries the single-metric shape when the list didn't match, so
  `Card.kpi`/`Card.metric` are mutually exclusive.
- **`src/widgets/kpi-view.ts`** (present, Increment 9) — client-side KPI
  stat-tile/chart/gauge rendering. `renderKpiTilesHtml`/`renderStatTileHtml`
  render plain stat tiles (no Chart.js); `kpiTableData` reshapes `KpiItem[]`
  into `TableData` so the Bar/Pie alternatives reuse `chart-view.ts`'s
  `mountChart` rather than bespoke configs, same pattern as
  `tasklist-view.ts`'s donut reuse. The Gauge view is a Chart.js `doughnut`
  hack (`circumference: 180`, `rotation: 270`, `cutout: '75%'`) with a
  two-segment dataset (`[value, max - value]`) and a small inline plugin
  (`gaugeCenterTextPlugin`) drawing the formatted value in the arc's center via
  `afterDraw`, since Chart.js has no built-in gauge type or center-text
  support. The gauge's `max` isn't in the source Markdown, so it's inferred
  (decided this increment, no prior source): a `%` value maxes at 100;
  otherwise the next power of ten strictly above the value (minimum 10).
  Gauges are tracked in their own `Map<heading, Chart>`
  (`destroyGauge`/`destroyAllGauges`), separate from `chart-view.ts`'s map, so
  `main.ts`'s `mountActiveView` clears both on every view switch/rebuild —
  necessary because a card's canvas is always replaced on toggle, so whichever
  map still references the old (now detached) canvas would otherwise leak.
- **`src/parser/mermaid.ts`** (present, Increment 10) — server-side
  extraction of a card's first ```` ```mermaid ```` fenced code block's raw
  source (`token.info`'s first whitespace-separated word, case-insensitively
  `mermaid`). Per `ELEMENTS.md` a mermaid fence has no switchable chart
  alternatives, so this is the only extraction its widget needs — the
  faithful "Markdown" raw-render mode is already correct without any special
  handling, since `markdownHtml` renders the untouched fence as a plain code
  block.
- **`src/parser/chartfence.ts`** (present, Increment 10) — server-side
  extraction/validation of a card's first ```` ```chart ```` fenced code
  block. The config schema was invented this increment (no prior source):
  `{ type?: string, categories: string[], series: { label: string, data:
  number[] }[] }`, parsed as JSON first and falling back to YAML (the `yaml`
  package, chosen over `js-yaml` for no native deps and an Node-18-compatible
  engine range) since JSON is a YAML subset and trying JSON first avoids
  YAML's laxer parsing masking a JSON typo. Malformed config (bad JSON/YAML,
  missing/mismatched-length arrays, non-numeric data) returns `undefined` —
  the card falls back to its plain fenced-code default render, the same
  "only alternatives valid for the data shape" rule `table.ts`'s column
  rejection already follows. Reuses `table.ts`'s `validChartTypes` on the
  parsed `TableData` (a fence's data is shaped identically to a table's, so
  no separate shape-validity ladder was needed); `type`, if given and valid
  for the shape, becomes `defaultType`, otherwise the first valid type does.
  `types` in the returned `ChartFence` holds only the *alternatives* (valid
  types minus `defaultType`) since the default type is rendered by the
  `default` view itself, not offered a second time as a toggle option.
- **`src/widgets/mermaid-view.ts`** (present, Increment 10; theme sync added
  Increment 11) — client-side `mermaid@^11` integration.
  `setMermaidTheme('light' | 'dark')` calls `mermaid.initialize` with
  `theme: 'default' | 'dark'`; `src/main.ts`'s theme module calls it both at
  boot and on every manual toggle flip, then re-renders whatever's mounted
  (mermaid has no live theme switch of its own — only the *next*
  `mermaid.render()` call picks up a re-`initialize`). `mountMermaid(heading,
  container, source)` calls `mermaid.render(id,
  source)` (async — needs a live container, so it's invoked from
  `mountActiveView` the same way Chart.js chart mounts are, but fire-and-forget
  since there's no synchronous chart-map bookkeeping to do first) and injects
  the resulting SVG; a parse error renders `.mermaid-error` text instead of
  throwing, since a syntax mistake in the user's own Markdown must never
  crash the dashboard. **Bug caught by `tests/mermaid-chart.spec.ts`, not by
  eye:** `mermaid.render()` stages its output in a hidden `#d<id>` div it
  appends directly to `<body>` and removes itself once the SVG is extracted
  — but only on the success path. On a parse error that cleanup never runs,
  leaving mermaid's own large error-diagram SVG (bomb icon + "Syntax error in
  text") floating outside the card grid entirely, below the whole dashboard.
  Fixed with a `finally` block that removes `#d<id>` unconditionally after
  every render call, success or failure.
- **`src/widgets/chart-view.ts`** (present, Increment 7; more widget modules
  land in Increments 8–10) — client-side Chart.js integration. Registers
  Chart.js's `registerables` once, then `mountChart(heading, canvas, table,
  chartType)` builds one of nine `ChartConfiguration`s (bar/grouped/stacked
  share one builder; line/area share one; pie/donut share one; radar and
  scatter are their own) and tracks the resulting `Chart` instance keyed by
  card heading so it can be `destroy()`-ed before the canvas is replaced —
  `destroyAllCharts()` clears every tracked chart ahead of a full-grid
  rebuild (live reload), `destroyChart(heading)` clears one when a single
  card's toggle switches away from a chart view (this also covers the
  Increment 8 progress-donut view, which mounts a `'donut'` chart built from
  `tasklist-view.ts`'s reshaped task data rather than a card's table).
  Colors come from the
  dataviz skill's validated 8-slot categorical palette (fixed order, never
  cycled — past 8 series/categories `foldToOther` sums the rest into a
  trailing "Other" slot), read at mount time from the `--series-1..8` /
  `--chart-text-*` / `--chart-grid` CSS custom properties in `src/style.css`
  (light/dark values switch with the `data-theme` attribute — see Increment
  11 below; since colors are read at mount time, not live-bound, a theme flip
  re-renders every mounted card so its chart(s) pick up the new palette).
  Legend follows the skill's rule: shown whenever a
  chart has 2+ series, and always for pie/donut (color there identifies the
  category, not a series). Chart lib decision, logged here since it was
  never made in Increments 1–2 as the North Star intended: **Chart.js** —
  its built-in bar/line/pie/doughnut/radar/scatter types cover every
  `ELEMENTS.md` chart alternative without a plugin, it's a small,
  browser-only dependency with no Node-version constraints (unlike
  chokidar/Vite, which are pinned for the Node 18 runtime), and its
  imperative `new Chart(canvas, config)` / `chart.destroy()` API maps
  directly onto this project's per-card mount/toggle/rebuild lifecycle.
  ECharts was the other candidate; passed over as heavier and more
  configuration-first than this project needs.
- **`src/main.ts`** (present) — client bootstrap; renders the static
  "Dashboard" shell (`<h1>`, unaffected by document content — see
  `tests/smoke.spec.ts`), a `#theme-toggle` button beside it (Increment 11),
  a `#file-nav` sidebar (Increment 13), and a `.dashboard-main` containing a
  `#doc-title` subtitle for the parsed `#` title and a `#content` grid
  container. **Folder navigation (present, Increment 13):** the WS handler
  branches on the message's `type` — a `files` message replaces `knownFiles`
  and, if `selectedFile` is unset or no longer in the list, resolves it from
  `localStorage`'s `md-dashboard:selectedFile` or else the first file, then
  calls `renderFileNav()`; a `content` message caches itself into the
  `documents: Map<string, ContentMessage>` keyed by `file` and only calls
  `renderCards` if it's for the currently selected file. `renderFileNav()`
  hides `#file-nav` entirely (`hidden` attribute) whenever `knownFiles.length
  <= 1`, so single-file mode's DOM and layout are byte-for-byte what they
  were before this increment. Clicking a sidebar button calls `selectFile`,
  which stores the choice and re-renders from the cached `documents` entry
  with **no server round-trip** — the server already pushed every file's
  content right after `files` on connect, and pushes a fresh `content` for
  just the changed file on every subsequent edit (see `server.ts` above), so
  the client never needs to ask for a file's content explicitly. **Theme
  module (present, Increment 11):** resolves the initial
  theme from `localStorage`'s `md-dashboard:theme` override, falling back to
  `matchMedia('(prefers-color-scheme: dark)')` — `index.html` runs the same
  resolution inline, synchronously, before first paint, so there's no flash
  of the wrong theme; this module just keeps `<html data-theme>` in sync
  afterwards. Clicking `#theme-toggle` flips the theme, stores the override,
  and calls `applyTheme`, which sets `data-theme`, re-`initialize`s mermaid's
  theme (`mermaid-view.ts`'s `setMermaidTheme`), and — since neither Chart.js
  colors nor a mounted mermaid SVG update live — re-renders the last-received
  `content` message (`lastMessage`, cached from the WebSocket handler) so
  every mounted chart/diagram redraws with the new palette. A
  `matchMedia` `change` listener keeps following the system preference for as
  long as no manual override is stored; a stored override always wins.
  `storedViewId(card)` (renamed from taking a heading to taking the whole
  `Card`) now clamps the persisted view id to one still valid for that card's
  *current* `viewsFor(card)` shape, falling back to `'default'` — otherwise a
  stored id that went stale (e.g. the underlying table lost a column and no
  longer offers Scatter) would render with no toggle button showing as
  pressed. If a `content` message has zero cards (no `##` sections in the
  file — e.g. an empty file, or one that's all preamble), `renderCards`
  shows a `.empty-state` message instead of an empty grid. Opens the `/ws`
  WebSocket connection and, on each `content` message, sets `#doc-title` and
  rebuilds `#content` as one
  `.card` per section: a `.card-header` (heading + toggle) and a
  `.card-body`. **Widget toggle framework (present, Increment 6; extended
  Increments 7-8):** each card builds a small `WidgetView[]` (each carrying a
  `kind` discriminant) — always `default` to `card.html` and `markdown` to
  `card.markdownHtml`, plus (Increment 7) one `kind: 'chart'` entry per
  `card.chartTypes[]` id, rendered as `<div class="chart-container">
  <canvas></canvas></div>` and mounted via `chart-view.ts`'s `mountChart`
  right after that HTML lands in the DOM (`mountActiveView`, called from both
  the full-grid rebuild and the toggle click handler) — Chart.js needs a live
  canvas element, so chart views can't be pure HTML strings the way
  `default`/`markdown` are. If `card.tasks` is non-empty (Increment 8), two
  more entries are appended: `kind: 'progress-bar'` (a CSS progress bar +
  percentage label from `tasklist-view.ts`'s `renderProgressBarHtml`) and
  `kind: 'progress-donut'` (a chart-container mounted as a `'donut'` chart via
  the same `mountChart`/`mountActiveView` path as table charts, fed
  `taskDonutData(card.tasks)` instead of `card.table`). Both task views
  render the same per-item checklist (`renderTaskItemsHtml`) below the
  aggregate, so each milestone's individual state stays visible next to the
  percentage. If `card.kpi` is set (Increment 9), three more entries are
  appended: `kind: 'kpi-tiles'` (`kpi-view.ts`'s `renderKpiTilesHtml`, plain
  HTML, no canvas), `kind: 'kpi-bar'`/`'kpi-pie'` (chart-container mounted via
  `mountChart(heading, canvas, kpiTableData(card.kpi), 'bar' | 'pie')`, reusing
  `chart-view.ts` the same way the progress-donut view does). If `card.metric`
  is set instead (mutually exclusive with `card.kpi`), one `kind: 'gauge'`
  entry is appended, mounted via `kpi-view.ts`'s `mountGauge`. `card.metric`
  also changes what the **`default`** view itself renders: `renderCardBody`
  special-cases `viewId === 'default' && card.metric` to
  `renderStatTileHtml(card.metric)` instead of `card.html` — per
  `ELEMENTS.md`, a lone `Metric: value` line's default widget is already a
  stat tile, not the plain-text render every other element's default is (the
  same way a table's default already renders the `<table>` itself).
  `mountActiveView` clears **both** `chart-view.ts`'s and `kpi-view.ts`'s
  chart maps (`destroyChart`/`destroyGauge`) unconditionally before mounting
  the active view's chart (if any), since a card's canvas element is replaced
  on every toggle regardless of which map it was tracked in. If `card.chartFence`
  is set (Increment 10), one `kind: 'chart'` entry per alternative type in
  `card.chartFence.types` is appended with an id prefixed `fence-` (e.g.
  `fence-pie`) rather than the bare type id `card.chartTypes` entries use —
  a card could in principle have both a real table and a chart fence, and
  the prefix keeps their view ids from colliding. `card.chartFence` also
  changes what the **`default`** view renders, the same special-casing
  pattern as `card.metric`: unless the card also has a real `card.table`
  (whose own default — the plain `<table>` — takes priority), `default`
  mounts the fence's own `defaultType` as a chart rather than showing the
  raw fence text. If `card.mermaid` is set (Increment 10), there are no
  extra toggle entries at all — only `default` is special-cased, to a
  `<div class="mermaid-container">` mounted asynchronously via
  `mermaid-view.ts`'s `mountMermaid` (fire-and-forget from
  `mountActiveView`, since `mermaid.render` is a promise and the rest of the
  mount pipeline is synchronous); the "Markdown" view needs no special
  handling since `card.markdownHtml` already renders the untouched fence as
  a plain code block. One icon button per view renders top-right of the
  card. The selected view id is looked up/stored in `localStorage` keyed by
  `md-dashboard:view:<heading>`, so it survives both a live-reload push and a
  full page reload; a card's heading is assumed unique within a document (not
  enforced). A single delegated `click` listener on `#content` handles every
  toggle button so it keeps working across full-grid rebuilds without
  re-binding. Escaping is applied to the heading text only — card body HTML
  is already markdown-it's own escaped output.
- **`src/style.css`** (present) — shell styling, including the responsive
  `.dashboard-grid`/`.card` layout (`auto-fill`/`minmax` grid; explicit
  breakpoints added Increment 11 — `max-width: 640px` collapses to a single
  column and tightens padding, `641–1024px` narrows the grid's `minmax` floor
  so 2+ columns still fit, `>1024px` uses the base `minmax(280px, 1fr)`) and
  the chart categorical palette as CSS custom properties (`--series-1..8`,
  `--chart-text-primary/secondary`, `--chart-grid`). **Theming (Increment
  11):** driven by `:root[data-theme='dark' | 'light']` attribute selectors,
  not `@media (prefers-color-scheme)` — the dark block is `:root`'s default
  variable values, the light block overrides them plus every
  `rgba(255,255,255,…)` border/background used elsewhere (`.card`,
  `.toggle-btn`, `.theme-toggle`, `.progress-bar`, `.kpi-tile`,
  `.dashboard-subtitle`, `.empty-state`); `data-theme` itself is set by JS
  (`index.html`'s inline boot script, then `src/main.ts`'s theme module), not
  CSS, since a manual override must be able to beat the system preference.
  `.card-header`/`.card-toggle` wrap (`flex-wrap: wrap`) since Increment 7
  pushed a card's toggle row up to 8 buttons wide, which overflowed a 280px
  card and visually spilled into the next grid column before this was added
  (caught by `tests/table.spec.ts`, not by eye). Also has the Increment 8
  `.progress-bar`/`.progress-bar-fill`/`.task-list`/`.task-item` rules for
  the progress-bar/donut views, the Increment 10
  `.mermaid-container`/`.mermaid-error` rules (the former centers the SVG and
  scrolls horizontally rather than clipping an oversized diagram; the latter
  colors the inline parse-error message with the palette's slot-3 hue), and
  the Increment 11 `.dashboard-header`/`.theme-toggle`/`.empty-state` rules,
  and the Increment 13 `.dashboard-body`/`.file-nav`/`.file-nav-btn`/
  `.dashboard-main` rules — `.dashboard-body` is a flex row (sidebar +
  main content) that collapses to a column with the sidebar as a wrapped
  button row at `max-width: 640px`, same breakpoint as the card grid's
  single-column collapse; `.file-nav[hidden]` (the `hidden` attribute, set
  by `src/main.ts` whenever there's only one file) removes the sidebar
  entirely rather than just visually hiding it, so single-file mode's layout
  is unaffected.

## Live-reload flow

1. `chokidar` (`src/server/watch.ts`) watches every discovered `.md` file
   (one, in single-file mode) for changes. **(present)**
2. On a change to one file, the server re-reads just that file, re-parses it
   with `src/parser/parse.ts`, and broadcasts the fresh
   `{ file, title, cards }` to every open `/ws` WebSocket connection —
   **not** the other files' documents. **(present)** Diffing the new card
   list against the last-sent one (to avoid a full re-render) is not done —
   the client rebuilds the whole grid on every push.
3. The client (`src/main.ts`) caches the pushed document by `file` and, if
   it's the currently selected file, rebuilds `#content` from its cards.
   **(present)** Each card's toggle selection is read from `localStorage` (not
   from the server push), so it is preserved across every rebuild. **(present,
   Increment 6)** The rebuild still replaces the whole grid rather than
   diffing/patching just the changed cards — an optimization left for later if
   it proves necessary.
4. Target latency: file save → visible dashboard update in **< ~1s** —
   verified by `tests/watch.spec.ts` (typically completes in a few hundred ms)
   and, for folder mode, `tests/folder.spec.ts`.

## Build

Two independent TypeScript builds share `src/` but never mix:

- **Browser bundle** — `tsconfig.json` (DOM lib, `noEmit`, no ambient
  `@types/node`) type-checks `src/main.ts` + `src/style.css`'s imports; `vite
  build` does the actual bundling into `dist/` (the shell the server serves).
  `src/cli.ts`, `src/server/`, and `src/parser/` are excluded from this
  config (they run server-side only); `src/widgets/chart-view.ts` and
  `src/widgets/kpi-view.ts` are browser-only and stay in it, so `kpi-view.ts`
  re-declares its own `KpiItem` type rather than importing
  `src/parser/kpi.ts`'s, same as `chart-view.ts` does for `ChartType`/
  `TableData`.
- **CLI/server bundle** — `tsconfig.server.json` (Node lib + types,
  `NodeNext` module resolution) compiles `src/cli.ts`, `src/server/**`, and
  `src/parser/**` to `dist-server/`. `bin/md-dashboard.js` is a plain JS
  shebang wrapper that imports `dist-server/cli.js`; this is what the `bin`
  field in `package.json` points at.

`npm run build` runs both (`tsc && vite build && tsc -p tsconfig.server.json`);
`npm run typecheck` type-checks both without emitting.

## Verification

- **`npm run build`** — must be green before every commit (see Build above).
- **`npm run typecheck`** — both `tsconfig.json` and `tsconfig.server.json`,
  `--noEmit`.
- **`npm test`** — Playwright E2E smoke suite (`tests/*.spec.ts`):
  `smoke.spec.ts` boots the Vite dev server itself (`webServer` in
  `playwright.config.ts`); `cli.spec.ts`, `watch.spec.ts`, and
  `parser.spec.ts` spawn the built `bin/md-dashboard.js` directly, so they
  exercise `npm run build`'s `dist/` and `dist-server/` output rather than
  the dev server. `cli.spec.ts` serves `tests/fixtures/sample.md`;
  `watch.spec.ts` uses its own temp-directory fixture (own port, cleaned up
  in `afterAll`) that it edits mid-test to verify the file → WebSocket → DOM
  live-reload path end to end; `parser.spec.ts` serves
  `tests/fixtures/elements.md` (each element type from `ELEMENTS.md`'s
  Increment-5 scope, plus content before the first `##`) to verify card
  count, title extraction, dropped pre-boundary content, and that prose,
  sub-headings, blockquote, code, image, and horizontal rule all render;
  `widgets.spec.ts` serves `tests/fixtures/widgets.md` (a task list) to
  verify the toggle switches between the default render (no checkboxes yet)
  and the Markdown raw-render mode (real, disabled checkboxes reflecting
  done/open state), and that the chosen view survives a full page reload;
  `table.spec.ts` serves `tests/fixtures/tables.md` (a single-series table, a
  two-series table, and a table-less prose section) to verify: the
  single-series table offers Bar/Pie/Donut/Line/Area/Radar but not
  Grouped/Stacked Bar or Scatter and a canvas mounts on toggle; the
  two-series table offers Grouped Bar/Stacked Bar/Scatter but not plain
  Bar/Pie; a table-less card offers no chart toggles at all; and the chosen
  chart view survives a full page reload, same as `widgets.spec.ts`;
  `tasklist.spec.ts` serves `tests/fixtures/tasklist.md` (a 4-item mixed task
  list, 2 done/2 open, plus a task-less prose section) to verify: the
  progress-bar view shows the correct percentage (50%, 2/4) and every
  milestone's individual checkbox state; the progress-donut view mounts a
  chart alongside the same per-item checklist; a task-less card offers no
  progress toggles; and the chosen progress view survives a full page
  reload; `kpi.spec.ts` serves `tests/fixtures/kpi.md` (a three-item numeric
  list, a lone `Metric: 99.9%` line, and a number-less prose section) to
  verify: the numeric list defaults to the plain list text and offers
  KPI-tiles/Bar/Pie, with the tiles view showing all three labels/values; the
  Bar and Pie views each mount a canvas; the lone metric line defaults to a
  stat tile (not plain text) and offers a Gauge that mounts a canvas; the
  number-less card offers no KPI/Gauge toggles; and the chosen KPI view
  survives a full page reload; `mermaid-chart.spec.ts` serves
  `tests/fixtures/diagrams.md` (a mermaid flowchart, an explicit `bar` chart
  fence with 3 categories/1 series, a deliberately invalid mermaid fence, and
  a fence-less prose section) to verify: the flowchart's default view is a
  rendered `<svg>` and it offers no toggle beyond default/markdown; the
  invalid diagram shows an inline `.mermaid-error` message and — the
  regression check for the bug below — leaves no orphaned `#dmermaid-*`
  staging element on `<body>`; the chart fence's default view is already the
  declared `bar` chart (not raw config text) and offers the other
  shape-valid types (`fence-line`/`fence-pie`/`fence-radar`, etc.) as
  `fence-`-prefixed toggles, each mounting a canvas and surviving a reload;
  and the fence-less card offers no diagram/chart toggles at all;
  `responsive-theme.spec.ts` serves `tests/fixtures/elements.md` (3 cards) to
  verify: the theme defaults to `prefers-color-scheme` when no override is
  stored (both light and dark, via `page.emulateMedia`); a manual
  `#theme-toggle` click overrides the system preference and the override
  survives a reload even if the system preference flips back; a 375px
  viewport stacks the 3 cards into a single column and a 1280px viewport lays
  the first two side by side; `empty-doc.spec.ts` serves
  `tests/fixtures/empty.md` (a `#` title with no `##` sections) to verify the
  dashboard shows a `.empty-state` message instead of a blank grid;
  `folder.spec.ts` (Increment 13) points the CLI at
  `tests/fixtures/folder/` (`alpha.md`, `beta.md`, and `nested/gamma.md`, to
  exercise recursive discovery) to verify: the sidebar lists all three files
  (id, not just basename, for the nested one) and the first one (`alpha.md`,
  sort order) renders by default; clicking another sidebar entry switches the
  rendered dashboard with no page navigation; the nested file is reachable
  the same way; and the selected file survives a full page reload — plus a
  second `describe` block re-runs `cli.spec.ts`'s single-file invocation to
  confirm `#file-nav` stays `hidden` there, i.e. this increment didn't change
  single-file mode's DOM.

## Source of truth

- **`ELEMENTS.md`** owns the Markdown element → widget mapping; this file
  owns the module/data-flow shape. If a module's responsibility changes,
  update this file and note why (commit message + `GOAL.md` Log).
