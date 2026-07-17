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
- **`src/server/server.ts`** (present; WebSocket planned Increment 4) — local
  HTTP server that serves the built dashboard shell (`dist/index.html` +
  assets) and confirms the target Markdown file is readable. Will grow a
  WebSocket endpoint and file-content injection in later increments. Never
  writes to the target file.
- **`src/server/open-browser.ts`** (present) — best-effort cross-platform
  "open the default URL in the browser", swallowing failures (headless/CI
  environments) since the URL is always printed too.
- **`src/server/watch.ts`** (planned, Increment 4) — wraps `chokidar` on the
  target `.md` file (or folder, Increment 13) and emits a "changed" event to
  the server when the file's mtime/content changes.
- **`src/parser/`** (planned, Increment 5) — wraps `markdown-it` to parse the
  file into a token stream, then splits on `##` boundaries into an ordered
  list of card models (heading text + child tokens). `#` becomes the
  dashboard title, not a card.
- **`src/widgets/`** (planned, Increments 6–10) — one module per widget type
  (prose, table, task-list, numeric/KPI, mermaid, chart, image, code,
  blockquote). Each widget knows how to render its default view, its
  shape-valid alternative views (from `ELEMENTS.md`), and the faithful
  "Markdown" raw-render mode. Toggle state is read/written to `localStorage`
  only — widgets never mutate the source file.
- **`src/main.ts`** (present) — client bootstrap; currently renders the empty
  "Dashboard" shell. Will grow into the client-side app that receives the
  card grid over the initial page load and WebSocket updates, and mounts
  widgets into the grid.
- **`src/style.css`** (present) — shell styling; will grow to cover the
  responsive grid and light/dark theming (Increment 11).

## Live-reload flow (planned, Increment 4)

1. `chokidar` watches the target `.md` file for changes.
2. On change, the server re-reads the file, re-runs the parser
   (`src/parser/`), and diffs the new card list against the last-sent one.
3. The server pushes the updated card data to the client over the open
   WebSocket connection.
4. The client re-renders only the changed cards, keeping each widget's
   current toggle selection (read from `localStorage`, not from the server
   push) so a live update never resets a widget the user has switched to a
   chart view.
5. Target latency: file save → visible dashboard update in **< ~1s**.

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
  `playwright.config.ts`); `cli.spec.ts` spawns the built
  `bin/md-dashboard.js` directly against `tests/fixtures/sample.md` and
  drives a real browser page against it, so it exercises `npm run build`'s
  `dist/` and `dist-server/` output rather than the dev server.

## Source of truth

- **`ELEMENTS.md`** owns the Markdown element → widget mapping; this file
  owns the module/data-flow shape. If a module's responsibility changes,
  update this file and note why (commit message + `GOAL.md` Log).
