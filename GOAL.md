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
- [ ] Increment 1 — git init; create the public GitHub repo `markdown-dashboard` (gh) with SSH remote; add `.gitignore` + README stub; scaffold a Vite + TypeScript skeleton with a runnable dev server showing an empty "Dashboard" shell; `npm run build` + `tsc --noEmit` green; initial commit + push.
- [ ] Increment 2 — set up Playwright + one smoke test (server starts, page loads, shell title visible); wire `npm test`; commit `ELEMENTS.md` (the agreed mapping table) and `ARCHITECTURE.md` (module overview, live-reload flow). Full verification pipeline green.

### CLI, server & live reload (core infra)
- [ ] Increment 3 — CLI entrypoint `md-dashboard <file.md>`: start a local HTTP server, read the file, serve the dashboard shell, open the browser. Smoke: run CLI against a sample `.md`, server responds with the shell.
- [ ] Increment 4 — chokidar file watch + WebSocket channel: on file change push to the client and re-render. Smoke: change the sample file → dashboard updates in < ~1s with no manual reload.

### Markdown parsing → card grid
- [ ] Increment 5 — markdown-it parsing + section splitter: `##` boundaries produce cards in a responsive grid; render prose, headings, blockquote, code block, image, horizontal rule. Smoke: sample file → expected card count + prose visible.

### Widgets & toggles
- [ ] Increment 6 — widget framework: per-card toggle (icon buttons, top-right) including the faithful "Markdown" raw-render mode (real checkboxes for `- [ ]`, proper lists); selection persisted in localStorage, survives live reload, never mutates the file. Smoke: toggle switches the view and the choice sticks after reload.
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
**Next action:** Increment 1 — `git init` in `/home/julian/projects/markdown-dasboard`; scaffold a Vite + TypeScript project (runnable dev server, empty "Dashboard" shell); add `.gitignore` + README stub; run `gh repo create juliantrude/markdown-dashboard --public --source=. --remote=origin --push`; confirm `npm run build` + `tsc --noEmit` are green before the commit.
**Blockers:** none

## Budget

- session pause threshold: 85%
- weekly pause threshold: 90%

## Log

<!-- Append-only, dated. One line per iteration. Newest at the bottom. -->
- 2026-07-17 — GOAL.md created via /grill-goal; nothing started yet
- 2026-07-17 — Increment 1 attempt: `npm create vite@latest` failed (requires Node 20+, this machine has Node 18.19.1). Retried with `npm create vite@5` pinned for Node 18 compat; the non-interactive prompt was mishandled and selected "Remove existing files and continue", which deleted GOAL.md, CLAUDE.md, and .hustle/ (all untracked, not yet committed). Recovered: GOAL.md and CLAUDE.md restored verbatim from conversation context; .hustle/ restored by rerunning hustle-setup.sh (idempotent scaffolding, systemd unit had survived independently). No project code existed yet at time of loss, so no other work was lost. Root cause: piping `y` into an arrow-key-driven interactive prompt instead of using a non-interactive flag — must avoid `npm create vite` interactive mode entirely from now on and use `--yes`/explicit non-interactive scaffolding instead.
