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
  is `{ type: 'content', title: string, cards: { heading: string, html: string }[] }`
  — `title`/`cards` come straight from `src/parser/parse.ts`.
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
  `html` (the default widget — currently plain markdown-it output; per-type
  widgets replace this in Increments 7–10) and `markdownHtml` (the faithful
  "Markdown" raw-render mode from `ELEMENTS.md` — same tokens, rendered a
  second time after `markCheckboxes()` mutates `- [ ]`/`- [x]` list items
  into real, disabled `<input type="checkbox">` elements). `html` is always
  rendered *before* the mutation runs, since both renders share one token
  array.
- **`src/widgets/`** (planned, Increments 7–10) — one module per data
  widget type (table, task-list, numeric/KPI, mermaid, chart). Each widget
  knows how to render its default view and its shape-valid alternative views
  (from `ELEMENTS.md`); they plug into the generic toggle framework already
  present in `src/main.ts` (below) by contributing additional `WidgetView`
  entries per card. Toggle state is read/written to `localStorage` only —
  widgets never mutate the source file.
- **`src/main.ts`** (present) — client bootstrap; renders the static
  "Dashboard" shell (`<h1>`, unaffected by document content — see
  `tests/smoke.spec.ts`), a `#doc-title` subtitle for the parsed `#` title,
  and a `#content` grid container. Opens the `/ws` WebSocket connection and,
  on each `content` message, sets `#doc-title` and rebuilds `#content` as one
  `.card` per section: a `.card-header` (heading + toggle) and a
  `.card-body`. **Widget toggle framework (present, Increment 6):** each card
  builds a small `WidgetView[]` (currently `default` → `card.html`,
  `markdown` → `card.markdownHtml`; Increments 7–10 add more ids per card,
  e.g. chart types) and renders one icon button per view, top-right of the
  card. The selected view id is looked up/stored in `localStorage` keyed by
  `md-dashboard:view:<heading>`, so it survives both a live-reload push and a
  full page reload; a card's heading is assumed unique within a document (not
  enforced). A single delegated `click` listener on `#content` handles every
  toggle button so it keeps working across full-grid rebuilds without
  re-binding. Escaping is applied to the heading text only — card body HTML
  is already markdown-it's own escaped output.
- **`src/style.css`** (present) — shell styling, including the responsive
  `.dashboard-grid`/`.card` layout (`auto-fill`/`minmax` grid, no fixed
  breakpoints yet); will grow to cover explicit breakpoints and light/dark
  theming (Increment 11).

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
  `src/cli.ts` and `src/server/` are excluded from this config.
- **CLI/server bundle** — `tsconfig.server.json` (Node lib + types,
  `NodeNext` module resolution) compiles `src/cli.ts` and `src/server/**` to
  `dist-server/`. `bin/md-dashboard.js` is a plain JS shebang wrapper that
  imports `dist-server/cli.js`; this is what the `bin` field in
  `package.json` points at.

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
  done/open state), and that the chosen view survives a full page reload.

## Source of truth

- **`ELEMENTS.md`** owns the Markdown element → widget mapping; this file
  owns the module/data-flow shape. If a module's responsibility changes,
  update this file and note why (commit message + `GOAL.md` Log).
