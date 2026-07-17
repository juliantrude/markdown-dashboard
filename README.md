# md-dashboard

A CLI tool that turns a single Markdown file into a responsive, live-updating web dashboard.

Running `md-dashboard <file.md>` starts a local server and opens a browser
showing a card grid — each `##` section becomes a card. Data-bearing elements
(tables, task lists, numeric lists, single metrics) can be toggled at runtime
between equivalent chart types and a faithful "Markdown" raw-render mode.
Editing the file updates the dashboard live over WebSocket, preserving each
widget's chosen view. The tool is read-only toward your content — it never
writes back to the Markdown file.

## Status

Early scaffold — under active development. See `GOAL.md` and `ELEMENTS.md`
for the current plan and element→widget mapping.

## Development

```sh
npm install
npm run dev        # start the Vite dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm test           # Playwright E2E smoke
```
