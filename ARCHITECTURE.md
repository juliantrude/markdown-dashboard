# ARCHITECTURE — md-dashboard

Module overview and live-reload flow for **md-dashboard**. This describes the
target architecture from the `GOAL.md` plan; modules not yet built are marked
**(planned)**.

## Modules

- **`src/cli.ts`** (planned, Increment 3) — entrypoint for `md-dashboard
  <file.md>`. Resolves the target file, starts the HTTP server, opens the
  default browser at the served URL.
- **`src/server/`** (planned, Increment 3–4) — local HTTP server that serves
  the dashboard shell (`index.html` + built assets) and exposes a WebSocket
  endpoint. Reads the target Markdown file on request; never writes to it.
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

## Verification

- **`npm run build`** — `tsc` + `vite build`, must be green before every
  commit.
- **`npm run typecheck`** — `tsc --noEmit`.
- **`npm test`** — Playwright E2E smoke suite (`tests/*.spec.ts`), driven by
  `playwright.config.ts`, which boots the Vite dev server itself
  (`webServer`) so the suite is self-contained.

## Source of truth

- **`ELEMENTS.md`** owns the Markdown element → widget mapping; this file
  owns the module/data-flow shape. If a module's responsibility changes,
  update this file and note why (commit message + `GOAL.md` Log).
