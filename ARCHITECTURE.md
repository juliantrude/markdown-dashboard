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
  path of the same HTTP server: on connection it sends the current file
  content once, and on every file-watch change it broadcasts the fresh
  content to all open sockets. Never writes to the target file. The content
  payload is raw file text for now (`{ type: 'content', content: string }`);
  Increment 5 will replace the payload with parsed card data without
  changing the connection/broadcast plumbing.
- **`src/server/open-browser.ts`** (present) — best-effort cross-platform
  "open the default URL in the browser", swallowing failures (headless/CI
  environments) since the URL is always printed too.
- **`src/server/watch.ts`** (present) — wraps `chokidar` (pinned to v4;
  v5 requires Node ≥20.19 and this machine runs Node 18.19.1) on the target
  `.md` file and invokes a callback with the fresh file content on `change`
  and `add` (editors that save atomically emit `unlink`+`add` instead of
  `change`), with `awaitWriteFinish` so partial writes are never read.
  Folder watching is Increment 13.
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
- **`src/main.ts`** (present) — client bootstrap; renders the "Dashboard"
  shell plus a `#content` element, opens the `/ws` WebSocket connection, and
  writes each incoming `content` message's raw text into `#content`
  (auto-reconnecting on drop). Will grow into the client-side app that
  receives the card grid over the initial page load and WebSocket updates,
  and mounts widgets into the grid, once the parser (Increment 5) lands.
- **`src/style.css`** (present) — shell styling; will grow to cover the
  responsive grid and light/dark theming (Increment 11).

## Live-reload flow

1. `chokidar` (`src/server/watch.ts`) watches the target `.md` file for
   changes. **(present)**
2. On change, the server re-reads the file and broadcasts its raw content to
   every open `/ws` WebSocket connection. **(present)** Re-running the parser
   (`src/parser/`) and diffing the new card list against the last-sent one is
   **planned, Increment 5** — until then the payload is the raw file text.
3. The client (`src/main.ts`) writes the pushed content straight into the DOM.
   **(present)** Re-rendering only the changed cards while keeping each
   widget's current toggle selection (read from `localStorage`, not from the
   server push) is **planned, Increment 6+**, once widgets exist.
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
  `playwright.config.ts`); `cli.spec.ts` and `watch.spec.ts` spawn the built
  `bin/md-dashboard.js` directly, so they exercise `npm run build`'s `dist/`
  and `dist-server/` output rather than the dev server. `cli.spec.ts` serves
  `tests/fixtures/sample.md`; `watch.spec.ts` uses its own temp-directory
  fixture (own port, cleaned up in `afterAll`) that it edits mid-test to
  verify the file → WebSocket → DOM live-reload path end to end.

## Source of truth

- **`ELEMENTS.md`** owns the Markdown element → widget mapping; this file
  owns the module/data-flow shape. If a module's responsibility changes,
  update this file and note why (commit message + `GOAL.md` Log).
