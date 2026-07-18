import mermaid from 'mermaid'

// Theme is picked once at load from the browser's color-scheme preference —
// there's no manual light/dark toggle yet (Increment 11), so this is a
// best-effort match rather than a live-synced theme.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
mermaid.initialize({ startOnLoad: false, theme: prefersDark ? 'dark' : 'default' })

let renderSeq = 0

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/**
 * Renders `source` (a ```mermaid fence's raw text) into `container` as SVG.
 * `mermaid.render` needs a fresh element id per call, so one is minted from
 * a monotonic counter plus the card heading (not just the heading, since a
 * card can be re-mounted — e.g. on live reload — while an old render is
 * still resolving). Invalid diagram source renders an inline error message
 * instead of throwing, since a syntax mistake in the user's Markdown must
 * never crash the dashboard.
 */
export async function mountMermaid(heading: string, container: HTMLElement, source: string): Promise<void> {
  const id = `mermaid-${renderSeq++}-${heading.replace(/[^a-zA-Z0-9_-]/g, '') || 'card'}`
  try {
    const { svg, bindFunctions } = await mermaid.render(id, source)
    container.innerHTML = svg
    bindFunctions?.(container)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    container.innerHTML = `<p class="mermaid-error">Invalid mermaid diagram: ${escapeHtml(message)}</p>`
  } finally {
    // mermaid.render() stages its output in a hidden `#d<id>` div appended to
    // <body> and removes it itself once the SVG is extracted — but only on
    // the success path. On a parse error that cleanup never runs, leaving an
    // orphaned error-diagram element floating outside our card layout.
    document.getElementById(`d${id}`)?.remove()
  }
}
