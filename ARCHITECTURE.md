# ARCHITECTURE — md-dashboard

Module overview and live-reload flow for **md-dashboard**. This describes the
target architecture from the `GOAL.md` plan; modules not yet built are marked
**(planned)**.

## Modules

- **`src/cli.ts`** (present) — entrypoint for `md-dashboard <file.md>`.
  Parses argv (`--port`, `--no-open`), validates the target file exists and
  is `.md`, starts the HTTP server, opens the default browser at the served
  URL. Compiled separately from the browser bundle (see Build below) and
  invoked via `bin/md-dashboard.js`.
- **`src/server/server.ts`** (present) — local HTTP server that serves the
  built dashboard shell (`dist/index.html` + assets) and confirms the target
  Markdown file is readable. Also runs a `ws` `WebSocketServer` on the `/ws`
  path of the same HTTP server: on connection it sends the current file,
  parsed, once, and on every file-watch change it broadcasts the fresh parsed
  document to all open sockets. Never writes to the target file. The payload
  is `{ type: 'content', title: string, cards: Card[] }` — `title`/`cards`
  come straight from `src/parser/parse.ts`; `Card` is `{ heading, html,
  markdownHtml, table?, chartTypes?, tasks? }` (`table`/`chartTypes` only
  present when the card's first table yields chartable data — see
  `src/parser/table.ts` below; `tasks` only present when the card contains
  `- [ ]`/`- [x]` items — see `src/parser/tasklist.ts` below).
- **`src/server/open-browser.ts`** (present) — best-effort cross-platform
  "open the default URL in the browser", swallowing failures (headless/CI
  environments) since the URL is always printed too.
- **`src/server/watch.ts`** (present) — wraps `chokidar` (pinned to v4;
  v5 requires Node ≥20.19 and this machine runs Node 18.19.1) on the target
  `.md` file and invokes a callback with the fresh file content on `change`
  and `add` (editors that save atomically emit `unlink`+`add` instead of
  `change`), with `awaitWriteFinish` so partial writes are never read.
  Folder watching is Increment 13.
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
  token array. It also calls `src/parser/table.ts`'s `extractTableData` and
  `src/parser/tasklist.ts`'s `extractTaskItems` on the same (pre-mutation)
  tokens, to look for the card's first table and any task-list items
  respectively — both must run before `markCheckboxes` for the same reason.
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
  (light/dark values already switch with `prefers-color-scheme`, matching
  the rest of the shell). Legend follows the skill's rule: shown whenever a
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
  `tests/smoke.spec.ts`), a `#doc-title` subtitle for the parsed `#` title,
  and a `#content` grid container. Opens the `/ws` WebSocket connection and,
  on each `content` message, sets `#doc-title` and rebuilds `#content` as one
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
  percentage. One icon button per view renders top-right of the
  card. The selected view id is looked up/stored in `localStorage` keyed by
  `md-dashboard:view:<heading>`, so it survives both a live-reload push and a
  full page reload; a card's heading is assumed unique within a document (not
  enforced). A single delegated `click` listener on `#content` handles every
  toggle button so it keeps working across full-grid rebuilds without
  re-binding. Escaping is applied to the heading text only — card body HTML
  is already markdown-it's own escaped output.
- **`src/style.css`** (present) — shell styling, including the responsive
  `.dashboard-grid`/`.card` layout (`auto-fill`/`minmax` grid, no fixed
  breakpoints yet) and the chart categorical palette as CSS custom
  properties (`--series-1..8`, `--chart-text-primary/secondary`,
  `--chart-grid`; light values under the existing `prefers-color-scheme:
  light` block). `.card-header`/`.card-toggle` wrap (`flex-wrap: wrap`) since
  Increment 7 pushed a card's toggle row up to 8 buttons wide, which
  overflowed a 280px card and visually spilled into the next grid column
  before this was added (caught by `tests/table.spec.ts`, not by eye). Also
  has the Increment 8 `.progress-bar`/`.progress-bar-fill`/`.task-list`/
  `.task-item` rules for the progress-bar/donut views. Will grow to cover
  explicit breakpoints and a manual light/dark toggle (Increment 11).

## Live-reload flow

1. `chokidar` (`src/server/watch.ts`) watches the target `.md` file for
   changes. **(present)**
2. On change, the server re-reads the file, re-parses it with
   `src/parser/parse.ts`, and broadcasts the fresh `{ title, cards }` to
   every open `/ws` WebSocket connection. **(present)** Diffing the new card
   list against the last-sent one (to avoid a full re-render) is not done —
   the client rebuilds the whole grid on every push.
3. The client (`src/main.ts`) rebuilds `#content` from the pushed cards.
   **(present)** Each card's toggle selection is read from `localStorage` (not
   from the server push), so it is preserved across every rebuild. **(present,
   Increment 6)** The rebuild still replaces the whole grid rather than
   diffing/patching just the changed cards — an optimization left for later if
   it proves necessary.
4. Target latency: file save → visible dashboard update in **< ~1s** —
   verified by `tests/watch.spec.ts` (typically completes in a few hundred ms).

## Build

Two independent TypeScript builds share `src/` but never mix:

- **Browser bundle** — `tsconfig.json` (DOM lib, `noEmit`, no ambient
  `@types/node`) type-checks `src/main.ts` + `src/style.css`'s imports; `vite
  build` does the actual bundling into `dist/` (the shell the server serves).
  `src/cli.ts`, `src/server/`, and `src/parser/` are excluded from this
  config (they run server-side only); `src/widgets/chart-view.ts` is
  browser-only and stays in it, so it re-declares its own `ChartType`/
  `TableData` types rather than importing `src/parser/table.ts`'s.
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
  reload.

## Source of truth

- **`ELEMENTS.md`** owns the Markdown element → widget mapping; this file
  owns the module/data-flow shape. If a module's responsibility changes,
  update this file and note why (commit message + `GOAL.md` Log).
