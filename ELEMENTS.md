# ELEMENTS — Markdown element → widget mapping

Authoritative mapping for **md-dashboard**, agreed with the user during
`/grill-goal`. Every Markdown element renders to a **default widget**. Data-bearing
elements expose an on-card **toggle** to switch between equivalent representations.

## Universal rules (apply to every card)

- **`##` heading defines a card boundary.** Each `##` section becomes one card in
  the responsive grid; `#` is the dashboard title.
- **Every card also offers a faithful "Markdown" raw-render mode** as a toggle
  option — it renders the section as normal Markdown (`- [ ]` becomes a real
  checkbox, lists/emphasis/links render properly).
- **Toggle state is per-widget, persisted in `localStorage`.** It survives live
  reload and **never mutates the source `.md` file** (the tool is read-only toward
  content).
- Only the alternatives **valid for the actual data shape** are offered (e.g. a
  single-series table won't offer grouped/stacked bar).

## Mapping table

| Markdown element | Default widget | Switchable alternatives |
|---|---|---|
| `#` / `##` heading | Card title / section boundary (`##` = new card) | — |
| Paragraph (prose) | Prose text block | — |
| **Table** (categorical + numeric) | Table | **Bar, Grouped Bar, Stacked Bar, Line, Area, Pie, Donut, Radar, Scatter** (only those matching the data shape) |
| Task list `- [ ]` / `- [x]` | Checklist (each item's done/open state visible) | Progress bar, Donut (% complete) — **individual milestone states stay visible** |
| Numeric list / `Key: value` pairs | List | Stat tiles (KPI), Bar, Pie |
| Blockquote `>` | Callout / quote card | — |
| Code block (generic) | Syntax-highlighted code | — |
| ` ```mermaid ` fence | Mermaid diagram | — |
| ` ```chart ` fence (JSON/YAML) | Explicit chart | Alternatives per data shape |
| Image `![]()` | Image widget | — |
| Single large number / `Metric: 42` | Stat tile (KPI number) | Gauge |
| Horizontal rule `---` | Card / section separator | — |
| Inline formatting (bold/italic/code) | Rendered inline within prose | — |

## Notes on specific widgets

- **Table → charts:** the prime charting source. The parser infers series/labels
  from the header row and first column; it offers the chart types whose shape the
  data supports and falls back to the plain table otherwise.
- **Task list / progress:** the progress bar or donut shows the completion
  percentage **and** keeps each milestone's individual done/open state visible —
  never a bare percentage.
- **Numeric / key-value lists:** `Key: value` lines with numeric values become KPI
  stat tiles, and can be charted as bar/pie.
- **Explicit charts (` ```chart `):** carry an explicit config (JSON/YAML) and may
  still offer the shape-valid alternatives.

> This file is the source of truth for the element→widget mapping. If a mapping
> changes, update this table and note **why** (in the commit and the GOAL.md Log).
