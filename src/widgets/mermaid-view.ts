import mermaid from 'mermaid'

/**
 * Re-initializes mermaid's theme. Mermaid has no live theme switch — the
 * next `mountMermaid()` call after this picks up the new theme, so callers
 * must also re-render any already-mounted diagrams (main.ts's theme toggle
 * does a full card re-render for exactly this reason).
 */
export function setMermaidTheme(theme: 'light' | 'dark'): void {
  mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' })
}

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
