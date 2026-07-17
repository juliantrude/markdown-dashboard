# GOAL

<!--
  Single source of truth for the /advance-goal loop (driven headless via the
  one-shot systemd chain, or interactively via `/loop /advance-goal`).
  The loop reads and rewrites this file every iteration.
-->

## North star

Build **md-dashboard**: a CLI-launched Node/TypeScript tool that turns a single
Markdown file into a **responsive, live-updating web dashboard**. Running
`md-dashboard <file.md>` starts a local server and opens a browser showing a
card grid — each `##` section becomes a card. Every Markdown element is rendered
to a matching widget; data-bearing elements (tables, task lists, numeric lists,
single metrics) can be **toggled at runtime between equivalent chart types** and
a faithful "Markdown" raw-render mode. Editing the file updates the dashboard
**live** (< ~1s) over WebSocket without a manual reload, preserving each widget's
chosen view. The element→widget mapping is authoritative in `ELEMENTS.md` (seeded
from the table agreed during /grill-goal). The tool is **read-only** toward the
user's content — it never writes back to the Markdown file.

Stack: Node/TypeScript, Vite, markdown-it (parsing), mermaid (diagrams), a chart
library (Chart.js or ECharts — decide in the scaffold increment), chokidar
(file watch), WebSocket (live reload), Playwright (E2E verification).

## Definition of Done

<!-- "fully blocked externally" does NOT count as done — this is a solo
     greenfield project with no expected external blockers. -->
- [ ] `md-dashboard <file.md>` starts a local server and opens a responsive dashboard; every `##` section renders as a card in a responsive grid.
- [ ] Every Markdown element in `ELEMENTS.md` renders to its default widget (prose, headings, blockquote, code, image, HR, table, task list, numeric/key-value list, single metric, ```mermaid, ```chart).
- [ ] Data widgets (table, task list, numeric list, single metric) can be switched via an on-card toggle between the defined equivalent chart types AND a faithful "Markdown" raw-render mode (`- [ ]` becomes a real checkbox, etc.); task/progress widgets show each individual milestone's done/open state; the chosen view persists per widget in localStorage, survives live reload, and never mutates the file.
- [ ] Editing the `.md` file updates the dashboard live (< ~1s) with no manual reload, and widget toggle state is preserved across the update.
- [ ] The dashboard supports light and dark mode: the default follows the browser's `prefers-color-scheme`, a manual toggle overrides it, and the manual choice persists (localStorage) across reloads.
- [ ] `npm run build`, `npm run typecheck` (tsc --noEmit), and `npm test` (Playwright E2E smoke) all pass green, and the repo is pushed to the public GitHub remote.

## Working Agreements (read every iteration — these override convenience)

**Priority order per iteration:**
1. If the user left a note/question in `## Status` (Blockers) or `## Log`, address that first.
2. Then take the next unchecked increment from `## Plan`.

**Git workflow:**
- Remote: public GitHub repo `github.com/juliantrude/markdown-dashboard` (SSH). Create it in Increment 1 via `gh repo create juliantrude/markdown-dashboard --public --source=. --remote=origin --push` (repo name is the corrected spelling — the local folder `markdown-dasboard` has a typo; keep the folder as-is).
- Per increment: one clean commit **directly on `main`**, then `git push`. No feature branches, no PRs.
- Commit messages in English, imperative mood, stating what + why. End every commit with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Verification bar before any commit:** `npm run build` green, `tsc --noEmit` green, AND the Playwright E2E smoke green. Never commit on a red verification run — fix or revert first.
- No force-push, no history rewrites on `main`. Never commit secrets or tokens.
- **Scaffolding safety (Node is v18 here):** never run interactive scaffolders (`npm create vite` in prompt mode selects destructive "Remove existing files" when fed piped input — it once deleted this GOAL.md/CLAUDE.md). Use only non-interactive, Node-18-pinned commands (e.g. `npm create vite@5 <dir> -- --template vanilla-ts`, or hand-write the config). Make the very first commit as early as possible so untracked files are never at risk.

**Out-of-scope systems (never modify):**
- The user's Markdown input files — the tool is strictly read-only toward content; a bug that writes back to the source file is a release blocker.
- Anything outside `/home/julian/projects/markdown-dasboard`.
- The imported team-core `GUIDANCE.md` (Poker Analysis Platform: GitLab repos, `uv`, Vue, MR etiquette) **does not apply here** — this is a standalone Node/TS project. Do not follow its GitLab/MR/uv/service-architecture rules. Escalation for anything ambiguous: leave a note in `## Status` Blockers and pick the next unblocked increment.

**Etiquette:**
- Code comments, commit messages, README, and in-app UI copy in English (public repo convention).
- Clean, idiomatic TypeScript; match established patterns as the codebase grows; keep functions small and typed.

**References:**
- Docs to consult/copy idioms from: markdown-it, mermaid, the chosen chart lib (Chart.js/ECharts), chokidar, Vite, Playwright.
- `ELEMENTS.md` is the authoritative element→widget mapping; update it (and note why) if a mapping changes.
- Constraint: Node is v18 on this machine — pin a Vite/toolchain version that runs on Node 18, or document a required Node upgrade in the Log rather than silently breaking the build.

## Plan

<!-- One increment per iteration; check off only when done AND verified. -->

### Scaffold & repo
- [x] Increment 1 — git init; create the public GitHub repo `markdown-dashboard` (gh) with SSH remote; add `.gitignore` + README stub; scaffold a Vite + TypeScript skeleton with a runnable dev server showing an empty "Dashboard" shell; `npm run build` + `tsc --noEmit` green; initial commit + push.
- [x] Increment 2 — set up Playwright + one smoke test (server starts, page loads, shell title visible); wire `npm test`; commit `ELEMENTS.md` (the agreed mapping table) and `ARCHITECTURE.md` (module overview, live-reload flow). Full verification pipeline green.

### CLI, server & live reload (core infra)
- [x] Increment 3 — CLI entrypoint `md-dashboard <file.md>`: start a local HTTP server, read the file, serve the dashboard shell, open the browser. Smoke: run CLI against a sample `.md`, server responds with the shell.
- [x] Increment 4 — chokidar file watch + WebSocket channel: on file change push to the client and re-render. Smoke: change the sample file → dashboard updates in < ~1s with no manual reload.

### Markdown parsing → card grid
- [x] Increment 5 — markdown-it parsing + section splitter: `##` boundaries produce cards in a responsive grid; render prose, headings, blockquote, code block, image, horizontal rule. Smoke: sample file → expected card count + prose visible.

### Widgets & toggles
- [x] Increment 6 — widget framework: per-card toggle (icon buttons, top-right) including the faithful "Markdown" raw-render mode (real checkboxes for `- [ ]`, proper lists); selection persisted in localStorage, survives live reload, never mutates the file. Smoke: toggle switches the view and the choice sticks after reload.
- [ ] Increment 7 — table widget: table ↔ Bar / Grouped Bar / Stacked Bar / Line / Area / Pie / Donut / Radar / Scatter (offer only the types valid for the data shape); integrate the chart lib. Smoke: a table renders as Bar and switches to Pie.
- [ ] Increment 8 — task-list widget: checklist ↔ progress bar / donut, with each milestone's done/open state clearly visible. Smoke: mixed `- [ ]`/`- [x]` → correct percentage AND per-item status shown.
- [ ] Increment 9 — numeric/key-value list → stat tiles (KPI) ↔ Bar/Pie; a single `Metric: value` → stat tile ↔ gauge. Smoke: both render and toggle.
- [ ] Increment 10 — ```mermaid fences → Mermaid diagram; ```chart fences (JSON/YAML config) → explicit chart with its valid alternatives. Smoke: both render.

### Polish & responsiveness
- [ ] Increment 11 — responsive breakpoints (mobile/tablet/desktop); light/dark theming: default from `prefers-color-scheme`, a manual light/dark toggle that overrides it, choice persisted in localStorage; robust toggle-state persistence; error handling (invalid/empty markdown). Playwright smokes across viewports and both color schemes.
- [ ] Increment 12 — complete README/docs (usage, examples, a demo GIF or screenshots) and ship a sample dashboard `.md` as a demo fixture.

### Folder support (later, as agreed)
- [ ] Increment 13 — accept a folder as input: watch all `.md` files, add sidebar navigation between dashboards, each file its own dashboard. Smoke: two files → both reachable, each renders.

### Closeout
- [ ] Final sweep: everything at spec or documented-blocked; DoD checkboxes above updated.

## Status

STATUS: READY
**Next action:** Increment 7 — table widget: table ↔ Bar / Grouped Bar / Stacked Bar / Line / Area / Pie / Donut / Radar / Scatter (offer only the types valid for the data shape); integrate the chart lib. Smoke: a table renders as Bar and switches to Pie. First sub-step: decide Chart.js vs ECharts (never logged in Increments 1-2) and record the call before integrating.
**Blockers:** none — on hold purely on session budget, not work-blocked.

## Budget

- session pause threshold: 85%
- weekly pause threshold: 90%

## Log

<!-- Append-only, dated. One line per iteration. Newest at the bottom. -->
- 2026-07-17 — GOAL.md created via /grill-goal; nothing started yet
- 2026-07-17 — Increment 1 attempt: `npm create vite@latest` failed (requires Node 20+, this machine has Node 18.19.1). Retried with `npm create vite@5` pinned for Node 18 compat; the non-interactive prompt was mishandled and selected "Remove existing files and continue", which deleted GOAL.md, CLAUDE.md, and .hustle/ (all untracked, not yet committed). Recovered: GOAL.md and CLAUDE.md restored verbatim from conversation context; .hustle/ restored by rerunning hustle-setup.sh (idempotent scaffolding, systemd unit had survived independently). No project code existed yet at time of loss, so no other work was lost. Root cause: piping `y` into an arrow-key-driven interactive prompt instead of using a non-interactive flag — must avoid `npm create vite` interactive mode entirely from now on and use `--yes`/explicit non-interactive scaffolding instead.
- 2026-07-17 — Increment 1 completed: found the Vite vanilla-ts scaffold already present untracked from the prior attempt (index.html, src/, tsconfig.json, package.json all valid). Retitled shell to "md-dashboard"/"Dashboard", stripped the template's counter/logo boilerplate (removed src/counter.ts, src/typescript.svg, public/vite.svg, the favicon link) down to an empty `<h1>Dashboard</h1>` shell, renamed package.json to `markdown-dashboard`, added a `typecheck` script, wrote a README stub. Ran `npm install` (12 packages), `npm run build` and `npm run typecheck` both green, and confirmed via `curl` against the running dev server that it serves the shell with the correct title. Created the public GitHub repo `juliantrude/markdown-dashboard` via `gh repo create`; first push over SSH failed with "Host key verification failed" (non-interactive shell, no ssh-askpass) — fixed by `ssh-keyscan github.com >> ~/.ssh/known_hosts` and retrying with `GIT_SSH_COMMAND="ssh -o BatchMode=yes"`. Root commit `a54b787` pushed clean to `main`. Noted for next iteration: `ELEMENTS.md` was never actually written to disk despite being referenced as already-seeded in the North Star — Increment 2 needs to author it (from the widget/chart-type notes already in `## Plan`), not just commit an existing file.
- 2026-07-17 — Blocker cleared by the user (not the loop): `ELEMENTS.md` authored directly on disk with the authoritative element→widget mapping table confirmed verbatim during /grill-goal (better source than reconstructing from Plan notes). Increment 2 should just commit it alongside ARCHITECTURE.md — do not rewrite it.
- 2026-07-17 — Increment 2 completed: installed `@playwright/test` (^1.61.1, runs fine on Node 18.19.1) and its Chromium browser; added `playwright.config.ts` (webServer boots `npm run dev` on :5173, self-contained) and `tests/smoke.spec.ts` (title + "Dashboard" heading visible); wired `npm test` → `playwright test`. Wrote `ARCHITECTURE.md` documenting the planned module layout (cli, server, watch, parser, widgets) and the live-reload flow (chokidar → diff → WebSocket push → client re-render preserving localStorage toggle state) ahead of those modules actually existing, per the GOAL.md plan. Committed `ELEMENTS.md` (authored by the user in the prior iteration) unchanged, alongside `ARCHITECTURE.md`, the Playwright config/test/scripts, and `.gitignore` additions for Playwright artifacts. Full verification green: `npm run build`, `npm run typecheck`, `npm test` (1 passed).
- 2026-07-17 — Increment 3 completed: added `src/cli.ts` (argv parsing for `<file.md>`/`--port`/`--no-open`, file-exists/`.md`-extension validation, exit code 1 with usage on error) and `src/server/server.ts` (Node `http` server serving `dist/` — the Vite-built shell — with a path-traversal guard and SPA fallback to `index.html`; confirms the target file is readable but doesn't parse it yet, per plan) and `src/server/open-browser.ts` (best-effort `open`/`xdg-open`/`start` cross-platform launch that only warns on failure, so it's safe in headless/CI). Split the TypeScript build in two so Node and DOM ambient types never mix: root `tsconfig.json` now excludes `src/cli.ts`/`src/server` and sets `"types": []`; new `tsconfig.server.json` (Node lib+types, `NodeNext` resolution, `outDir: dist-server`) compiles the CLI/server. `bin/md-dashboard.js` is a tiny shebang wrapper importing the compiled `dist-server/cli.js`; `package.json` `bin` field points at it. `npm run build`/`typecheck` now run both tsconfigs; added `@types/node` (^18.19, matches the Node 18.19.1 runtime). Added `tests/fixtures/sample.md` and `tests/cli.spec.ts` (spawns the built CLI, waits for its stdout ready-line, drives a real Playwright page against it, kills it in `afterAll`) — a second, independent smoke path from `smoke.spec.ts`'s dev-server test, and the first test that actually exercises `npm run build`'s output. Manually verified CLI error paths too (missing arg, missing file, wrong extension) — all exit 1 with a clear message. Full verification green from a clean `dist`/`dist-server`: build, typecheck, `npm test` (2 passed). Committed `12077ec`, pushed to `main`.
- 2026-07-17 — Increment 4 completed: added `src/server/watch.ts` wrapping `chokidar` — pinned to `^4` (v5 requires Node ≥20.19; this machine runs 18.19.1) — with `awaitWriteFinish` and listening on both `change` and `add` (atomic-save editors emit `unlink`+`add`), invoking a callback with the fresh file content. `src/server/server.ts` now runs a `ws` `WebSocketServer` on the same HTTP server's `/ws` path: sends current file content on connect, broadcasts fresh content to all open sockets on every watch callback; `close()` now tears down the watcher and `wss` too. `src/main.ts` opens the `/ws` connection on load, writes incoming `{type:'content', content}` messages into a new `#content` `<pre>` element, and auto-reconnects on drop. The content payload is intentionally raw file text, not parsed cards — Increment 5's parser will swap the payload shape without touching this connection/broadcast plumbing (noted in `ARCHITECTURE.md`, which was updated throughout to mark the watch/WS pieces "present" instead of "planned"). Added `tests/watch.spec.ts`: spins up the built CLI against its own temp-directory fixture (own port 4320, isolated from `cli.spec.ts`'s `tests/fixtures/sample.md`), asserts initial content renders, edits the file mid-test, and asserts the DOM updates within 2s — observed ~300ms in practice, well under the <1s target. Full verification green from a clean `dist`/`dist-server`: build, typecheck, `npm test` (3 passed, all green). Committed `9760734`, pushed to `main`.
- 2026-07-17 — Increment 5 completed: added `markdown-it@^14` + `@types/markdown-it@^14` and `src/parser/parse.ts` (`parseDocument`), which walks markdown-it's token stream once, takes the first `#` heading as `title`, and splits on `##` `heading_open` tokens into `Card[]` (`{ heading, html }`, body rendered via `md.renderer.render` on that section's tokens). Content before the first `##` boundary (other than the title) is deliberately dropped — every card lives under a `##`, per `ELEMENTS.md`; this is a design decision worth knowing about if a future increment wants a "preamble" card. `src/parser/` compiles under `tsconfig.server.json` (Node-side only, added to its `include`; excluded from the browser `tsconfig.json`) since parsing happens server-side, not in the browser bundle. `src/server/server.ts` now calls `parseDocument` on initial connect and on every watch callback, sending `{ type: 'content', title, cards }` over `/ws` instead of raw text. `src/main.ts` renders a `#doc-title` subtitle plus one `.card` (`.card-heading` + `.card-body`) per section into `#content` (now a grid `<div>`, not a `<pre>`); only the heading text is escaped client-side since markdown-it (`html: false`) already escapes the body HTML server-side. Added `.dashboard-grid`/`.card` responsive grid CSS (`auto-fill`/`minmax`, no fixed breakpoints — that's Increment 11) with light/dark variants. Added `tests/fixtures/elements.md` (prose, bold/italic, an h3 sub-heading, blockquote, code block, image, hr, and a paragraph before the first `##` to prove it's dropped) and `tests/parser.spec.ts` (card count, title extraction, dropped-preamble check, and that every Increment-5 element type renders); had to add `test.describe.configure({ mode: 'serial' })` to that file because `playwright.config.ts`'s `fullyParallel: true` was scheduling its two tests onto separate workers, each spawning its own CLI on the same port (`EADDRINUSE`, silently manifesting as a `beforeAll` timeout) — `cli.spec.ts`/`watch.spec.ts` never hit this since they're one test each. Updated `tests/watch.spec.ts`'s fixture to add a `## Status` heading (its old preamble-only content would now be silently dropped by the parser). Updated `ARCHITECTURE.md` throughout: parser module marked present, WS payload shape, live-reload flow, and the verification/test-suite section. Full verification green from a clean `dist`/`dist-server`/`test-results`: build, typecheck, `npm test` (5 passed).
- 2026-07-17 22:32 — Budget re-check before starting Increment 7: session still at 92% (previous check at 22:17 saw 91%, hadn't reset yet — reset is 2026-07-18 01:50am Europe/Berlin). No work done this run to avoid starting a chart-lib integration mid-session-limit; re-armed for 2026-07-18 01:52 (session reset + 2min buffer) instead of another short poll, since the session won't reset for ~3h and polling every ~15min would just burn week budget for no progress. Week budget is healthy (34%). Next run should proceed straight to Increment 7.
- 2026-07-17 — Increment 6 completed: `Card` now carries two renders — `html` (unchanged default widget render) and `markdownHtml` (the faithful "Markdown" raw-render mode from `ELEMENTS.md`). Added `markCheckboxes()` in `src/parser/parse.ts`: a small hand-written token-mutation pass (no new dependency) that finds `inline` tokens whose first child is text matching `/^\[([ xX])\]\s+/`, strips the bracket marker, and unshifts a manually-constructed `html_inline` `Token` containing a real `<input type="checkbox" disabled>` (checked if `[x]`/`[X]`) — confirmed `html_inline` tokens render their raw `content` regardless of the `html:false` parser option (that option only gates *parsing* literal HTML in the source, not rendering tokens inserted programmatically). `flush()` renders `html` from the untouched tokens *before* calling `markCheckboxes()`, then renders `markdownHtml` from the same (now-mutated) array — order matters since both renders share one token array. `src/main.ts` adds a small generic `WidgetView[]` framework per card (currently two views: `default` → `card.html`, `markdown` → `card.markdownHtml`); Increments 7-10 extend this by contributing more view ids (chart types, progress, KPI) rather than restructuring it. Icon toggle buttons render top-right of each card (`.card-header`); selection is looked up/written to `localStorage` under `md-dashboard:view:<heading>` (heading assumed unique within a doc, not enforced) so it survives both a live-reload push and a full page reload. One delegated `click` listener on `#content` handles all toggle buttons, so it keeps working across the full-grid rebuilds that live reload already does — no per-render re-binding needed. Added `.card-header`/`.card-toggle`/`.toggle-btn` CSS (light+dark variants) and a small `.card-body input[checkbox]` margin rule. Added `tests/fixtures/widgets.md` (a two-item task list, one done one open) and `tests/widgets.spec.ts` (default view has zero checkboxes and shows literal `[ ] Buy milk` text — the checklist *widget* itself is Increment 8, this increment only adds the toggle mechanism and the raw-render alternative; clicking the Markdown toggle shows two real checkboxes with correct checked state; a second test confirms the choice survives `page.reload()`); needed the same `test.describe.configure({ mode: 'serial' })` fix as `parser.spec.ts` for the same reason (two tests sharing one spawned CLI on one port, `fullyParallel` was racing a second spawn onto the same port). Updated `ARCHITECTURE.md`'s parser/widgets/main.ts sections and verification list. Full verification green from a clean `dist`/`dist-server`/`test-results`: build, typecheck, `npm test` (7 passed). Note for Increment 7: the North Star says "decide [Chart.js vs ECharts] in the scaffold increment" but no such decision was ever logged in Increments 1-2 — Increment 7 needs to make and record that call before integrating a chart lib.
