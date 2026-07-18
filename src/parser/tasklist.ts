import MarkdownIt from 'markdown-it'
import Token from 'markdown-it/lib/token.mjs'

const md: MarkdownIt = new MarkdownIt({ html: false })

export interface TaskItem {
  /** Rendered inline HTML for the item's label (bold/links/etc. preserved), marker stripped. */
  html: string
  done: boolean
}

const taskMarker = /^\[([ xX])\]\s+/

/**
 * Finds every task-list item (`- [ ]` / `- [x]`) in a card's token stream and
 * returns its label + done state, in document order, or `undefined` if the
 * card has none. Must run on the *unmutated* tokens — parse.ts's `flush()`
 * calls this before `markCheckboxes` rewrites the same inline tokens, same
 * ordering constraint as `extractTableData`.
 */
export function extractTaskItems(tokens: Token[]): TaskItem[] | undefined {
  const items: TaskItem[] = []

  for (const token of tokens) {
    if (token.type !== 'inline') continue
    const match = taskMarker.exec(token.content)
    if (!match) continue
    items.push({ html: md.renderInline(token.content.slice(match[0].length)), done: match[1] !== ' ' })
  }

  return items.length > 0 ? items : undefined
}
