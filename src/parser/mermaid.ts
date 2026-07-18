import Token from 'markdown-it/lib/token.mjs'

/**
 * Finds the first ```mermaid fenced code block in a card's token stream and
 * returns its raw source, or `undefined` if there's none. Per ELEMENTS.md a
 * mermaid fence has no switchable chart alternatives — only the default
 * (rendered diagram) and the universal "Markdown" raw-render mode (the
 * fenced code block text, already what `markdownHtml` renders untouched)
 * apply.
 */
export function extractMermaidSource(tokens: Token[]): string | undefined {
  const fence = tokens.find(
    (token) => token.type === 'fence' && token.info.trim().split(/\s+/)[0]?.toLowerCase() === 'mermaid',
  )
  return fence?.content
}
