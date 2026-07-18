import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
import { chooseDefaultChart, extractTableData, validChartTypes, type ChartType, type TableData } from './table.js'
import { extractTaskItems, type TaskItem } from './tasklist.js'
import { extractKpiListItems, extractSingleMetric, type KpiItem } from './kpi.js'
import { extractMermaidSource } from './mermaid.js'
import { extractChartFence, type ChartFence } from './chartfence.js'

const md: MarkdownIt = new MarkdownIt({ html: false })

export interface Card {
  heading: string
  /** Full default render of everything in the section — the fallback body for cards with no chartable shape. */
  html: string
  /** Faithful "Markdown" raw-render mode (ELEMENTS.md): real lists, real (disabled) checkboxes for `- [ ]`/`- [x]`. */
  markdownHtml: string
  /**
   * Top-level paragraph HTML only. Chart-first (ELEMENTS.md v2) renders this as
   * the caption *under* a card's chart, clamped to 2 lines with "Read more" —
   * so it must exclude text that already belongs to another widget (list items,
   * table cells, blockquotes) and the lone `Metric:` line, or it would appear twice.
   */
  prose?: string
  /** The card's first table rendered on its own, for the "Table" toggle alternative — `html` would drag the prose along and duplicate the caption. */
  tableHtml?: string
  /** Chart-ready data extracted from the card's first table, if any (Increment 7). */
  table?: TableData
  /** Chart types valid for `table`'s shape, per ELEMENTS.md ("only alternatives valid for the data shape"). */
  chartTypes?: ChartType[]
  /** The chart the table renders as by default under chart-first — picked from the data shape server-side, so the client needn't pull the parser in to decide. */
  defaultChartType?: ChartType
  /** Task-list items (`- [ ]`/`- [x]`) found anywhere in the card, if any (Increment 8). */
  tasks?: TaskItem[]
  /** `Key: value` numeric list items, if the card's whole list qualifies (Increment 9). Mutually exclusive with `metric`. */
  kpi?: KpiItem[]
  /** A lone `Key: value` numeric paragraph, if the card has no list and exactly one such line (Increment 9). Mutually exclusive with `kpi`. */
  metric?: KpiItem
  /** Raw source of the card's first ` ```mermaid ` fence, if any (Increment 10). */
  mermaid?: string
  /** The card's first ` ```chart ` fence, parsed into chart-ready data, if its config is valid (Increment 10). */
  chartFence?: ChartFence
}

export interface ParsedDocument {
  title: string
  cards: Card[]
}

function headingText(tokens: Token[], headingOpenIndex: number): string {
  return tokens[headingOpenIndex + 1]?.content ?? ''
}

const taskMarker = /^\[([ xX])\]\s+/

/**
 * Mutates `tokens` in place so `- [ ]` / `- [x]` list items render as real,
 * disabled checkboxes instead of literal bracket text — the "Markdown"
 * raw-render mode's defining example (ELEMENTS.md). Must run *after* the
 * default-widget HTML has already been rendered from these tokens, since it
 * mutates the shared token array.
 */
function markCheckboxes(tokens: Token[]): void {
  for (let i = 0; i < tokens.length; i++) {
    const inline = tokens[i]
    if (inline.type !== 'inline' || !inline.children) continue

    const first = inline.children[0]
    if (!first || first.type !== 'text') continue

    const match = taskMarker.exec(first.content)
    if (!match) continue

    first.content = first.content.slice(match[0].length)

    const checkbox = new Token('html_inline', '', 0)
    checkbox.content = `<input type="checkbox" disabled${match[1] !== ' ' ? ' checked' : ''}> `
    inline.children.unshift(checkbox)

    for (let j = i - 1; j >= 0; j--) {
      if (tokens[j].type === 'list_item_open') {
        tokens[j].attrJoin('class', 'task-list-item')
        break
      }
      if (tokens[j].type === 'list_item_close') break
    }
  }
}

/**
 * Renders only the card's *top-level* paragraphs (`level === 0`). Paragraphs
 * nested inside a list item, blockquote or table cell have a level above 0, so
 * this deliberately skips them: that text is already displayed by the list /
 * callout / chart widget that owns it, and repeating it in the caption would
 * show it twice.
 */
function extractProseHtml(tokens: Token[]): string | undefined {
  const prose: Token[] = []

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'paragraph_open' || tokens[i].level !== 0) continue
    const inline = tokens[i + 1]
    const close = tokens[i + 2]
    if (inline?.type === 'inline' && close?.type === 'paragraph_close') {
      prose.push(tokens[i], inline, close)
      i += 2
    }
  }

  if (prose.length === 0) return undefined
  const html = md.renderer.render(prose, md.options, {}).trim()
  return html === '' ? undefined : html
}

/** Renders the card's first table on its own (`table_open` … `table_close`). */
function extractTableHtml(tokens: Token[]): string | undefined {
  const start = tokens.findIndex((token) => token.type === 'table_open')
  if (start === -1) return undefined
  const end = tokens.findIndex((token, index) => index > start && token.type === 'table_close')
  if (end === -1) return undefined
  return md.renderer.render(tokens.slice(start, end + 1), md.options, {})
}

/**
 * Splits a Markdown document into the dashboard shape: the first `#` heading
 * becomes the title (not a card), and every `##` heading starts a new card
 * that owns all tokens up to the next `##` (or the end of the document).
 * Content before the first `##` that isn't the title is dropped — every
 * card must live under a `##` boundary, per ELEMENTS.md.
 */
export function parseDocument(markdown: string): ParsedDocument {
  const tokens = md.parse(markdown, {})

  let title = ''
  let sawTitle = false
  const cards: Card[] = []
  let currentHeading: string | null = null
  let currentTokens: Token[] = []

  const flush = (): void => {
    if (currentHeading !== null) {
      const html = md.renderer.render(currentTokens, md.options, {})
      const table = extractTableData(currentTokens) ?? undefined
      const chartTypes = table ? validChartTypes(table) : undefined
      const defaultChartType = table ? chooseDefaultChart(table) : undefined
      const tasks = extractTaskItems(currentTokens)
      const kpi = extractKpiListItems(currentTokens)
      const metric = kpi ? undefined : extractSingleMetric(currentTokens)
      const mermaid = extractMermaidSource(currentTokens)
      const chartFence = extractChartFence(currentTokens)
      const tableHtml = extractTableHtml(currentTokens)
      // A lone `Metric: value` card's only paragraph *is* the metric, and the
      // stat tile already renders it — so it must not also become a caption.
      const prose = metric ? undefined : extractProseHtml(currentTokens)
      markCheckboxes(currentTokens)
      const markdownHtml = md.renderer.render(currentTokens, md.options, {})
      cards.push({ heading: currentHeading, html, markdownHtml, prose, tableHtml, table, chartTypes, defaultChartType, tasks, kpi, metric, mermaid, chartFence })
    }
    currentHeading = null
    currentTokens = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.type === 'heading_open' && token.tag === 'h1' && !sawTitle) {
      title = headingText(tokens, i)
      sawTitle = true
      i += 2 // skip the inline content token and heading_close
      continue
    }

    if (token.type === 'heading_open' && token.tag === 'h2') {
      flush()
      currentHeading = headingText(tokens, i)
      i += 2 // skip the inline content token and heading_close
      continue
    }

    if (currentHeading !== null) currentTokens.push(token)
  }
  flush()

  return { title, cards }
}
