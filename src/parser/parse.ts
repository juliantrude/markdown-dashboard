import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

const md: MarkdownIt = new MarkdownIt({ html: false })

export interface Card {
  heading: string
  html: string
}

export interface ParsedDocument {
  title: string
  cards: Card[]
}

function headingText(tokens: Token[], headingOpenIndex: number): string {
  return tokens[headingOpenIndex + 1]?.content ?? ''
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
      cards.push({ heading: currentHeading, html: md.renderer.render(currentTokens, md.options, {}) })
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
