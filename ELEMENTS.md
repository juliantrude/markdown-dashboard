# ELEMENTS — Markdown element → widget mapping

Authoritative mapping for **md-dashboard**. Every Markdown element renders to a
**default widget**; data-bearing elements expose an on-card **toggle** to switch
between equivalent representations.

**v2 — chart-first.** The dashboard leads with the visualisation, not the text.
Anything that *can* be a chart renders *as* a chart by default; the original
Markdown stays reachable, but only on demand and for transparency.

## Universal rules (apply to every card)

- **`##` heading defines a card boundary.** Each `##` section becomes one card in
  the responsive grid; `#` is the dashboard title.
- **Chart-first:** if a card has chartable content, its default view is the
  chart — never the underlying table/list. The plain table/list stays available
  as a toggle alternative.
- **Text is secondary but never lost.** Prose accompanying a chart renders as a
  caption below it, clamped to **2 rendered lines**; if it overflows, a
  **"Read more"** control expands the full text inline (click again to collapse).
  This applies to **every** card that shows text, including prose-only cards.
- **Prose-only sections still get a card**, visually de-emphasised so charts
  dominate the grid. Content is never silently dropped.
- **Transparency is two-tier:** every card keeps its faithful "Markdown"
  raw-render mode (`- [ ]` becomes a real checkbox), and a **global toggle**
  shows the whole original document at once.
- **Toggle state is per-widget, persisted in `localStorage`.** It survives live
  reload and **never mutates the source `.md` file** (the tool is read-only
  toward content).
- Only the alternatives **valid for the actual data shape** are offered (e.g. a
  single-series table won't offer grouped/stacked bar).

## Mapping table

| Markdown element | Default widget (chart-first) | Switchable alternatives |
|---|---|---|
| `#` / `##` heading | Card title / section boundary (`##` = new card) | — |
| Paragraph (prose) | Caption under the card's chart; on a prose-only card, a de-emphasised text card. 2-line clamp + "Read more" | — |
| **Table** (categorical + numeric) | **Chart, auto-chosen from the data shape** (see below) | **Table**, Bar, Grouped Bar, Stacked Bar, Line, Area, Pie, Donut, Radar, Scatter (only those matching the data shape) |
| Task list `- [ ]` / `- [x]` | **Segmented progress bar** — one segment per item | Segmented donut/pie, Checklist |
| Numeric list / `Key: value` pairs | **Stat tiles (KPI)** | List, Bar, Pie |
| Blockquote `>` | Callout / quote card | — |
| Code block (generic) | Syntax-highlighted code | — |
| ` ```mermaid ` fence | Mermaid diagram | — |
| ` ```chart ` fence (JSON/YAML) | Explicit chart | Alternatives per data shape |
| Image `![]()` | Image widget | — |
| Single large number / `Metric: 42` | Stat tile (KPI number) | Gauge |
| Horizontal rule `---` | Card / section separator | — |
| Inline formatting (bold/italic/code) | Rendered inline within prose | — |

## Default chart selection (tables)

Chosen from the data shape, and always a type `validChartTypes` allows:

1. **Line** — the first column looks time-like (year `2024`, ISO date, `Q1`,
   month name). A time axis is a trend, so a trend chart wins.
2. **Grouped Bar** — two or more numeric series (comparison across series).
3. **Bar** — everything else (the safe categorical default).

## Notes on specific widgets

- **Table → charts:** the prime charting source. The parser infers series/labels
  from the header row and first column; the plain table remains one toggle away.
- **Task list → segmented chart:** every item becomes its **own equal-sized
  segment** of the progress bar or donut — never a two-slice Done/Open
  aggregate. Segments are coloured by status (done vs open), and **hover
  (desktop) or tap (touch)** reveals that item's text in a tooltip. Above
  **20 items** the card additionally offers an on-demand compact item list,
  since segments get too thin to target comfortably.
  Because segment colour encodes *status* (two states), the categorical
  8-slot palette limit and its "Other" folding deliberately do **not** apply here.
- **Numeric / key-value lists:** `Key: value` lines with numeric values default
  to KPI stat tiles, and can be charted as bar/pie.
- **Explicit charts (` ```chart `):** carry an explicit config (JSON/YAML) and may
  still offer the shape-valid alternatives.

> This file is the source of truth for the element→widget mapping. If a mapping
> changes, update this table and note **why** (in the commit and the GOAL.md Log).
