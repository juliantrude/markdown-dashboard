import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'
import { extractTableData, validChartTypes, type ChartType, type TableData } from './table.js'
import { extractTaskItems, type TaskItem } from './tasklist.js'

const md: MarkdownIt = new MarkdownIt({ html: false })

export interface Card {
  heading: string
  /** Default widget render: for a table-bearing card this is already the plain `<table>` (ELEMENTS.md: default widget for Table is Table itself). */
  html: string
  /** Faithful "Markdown" raw-render mode (ELEMENTS.md): real lists, real (disabled) checkboxes for `- [ ]`/`- [x]`. */
  markdownHtml: string
  /** Chart-ready data extracted from the card's first table, if any (Increment 7). */
  table?: TableData
  /** Chart types valid for `table`'s shape, per ELEMENTS.md ("only alternatives valid for the data shape"). */
  chartTypes?: ChartType[]
  /** Task-list items (`- [ ]`/`- [x]`) found anywhere in the card, if any (Increment 8). */
  tasks?: TaskItem[]
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
      const tasks = extractTaskItems(currentTokens)
      markCheckboxes(currentTokens)
      const markdownHtml = md.renderer.render(currentTokens, md.options, {})
      cards.push({ heading: currentHeading, html, markdownHtml, table, chartTypes, tasks })
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
