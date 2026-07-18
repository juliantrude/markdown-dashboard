export interface TaskItem {
  html: string
  done: boolean
}

export interface TaskProgress {
  done: number
  total: number
  percent: number
}

/**
 * Above this many items the segments get too thin to target comfortably, so the
 * card additionally offers an on-demand compact item list (ELEMENTS.md v2). The
 * segments themselves are never folded or grouped — every item keeps its own.
 */
export const TASK_LIST_THRESHOLD = 20

export function taskProgress(tasks: TaskItem[]): TaskProgress {
  const done = tasks.filter((task) => task.done).length
  const total = tasks.length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}

/** Plain text of an item's inline HTML — chart labels and tooltips are text, not markup. */
export function taskLabel(task: TaskItem): string {
  const holder = document.createElement('div')
  holder.innerHTML = task.html
  return (holder.textContent ?? '').trim()
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/**
 * The chart-first default for a task list: one equal-sized segment per item,
 * coloured by status — not a two-slice Done/Open aggregate. The item's text
 * lives on `data-label` for the shared tooltip (hover on desktop, tap on
 * touch); each segment is a real `<button>` so it stays keyboard- and
 * screen-reader-reachable rather than being a hover-only affordance.
 */
export function renderProgressBarHtml(tasks: TaskItem[]): string {
  const { done, total, percent } = taskProgress(tasks)
  const segments = tasks
    .map((task) => {
      const label = taskLabel(task)
      const status = task.done ? 'done' : 'open'
      return `<button type="button" class="task-segment task-segment-${status}" data-label="${escapeHtml(label)}" data-done="${task.done}" aria-label="${escapeHtml(`${label} — ${status}`)}"></button>`
    })
    .join('')
  return `
    <div class="task-segments" role="group" aria-label="Task progress by item">${segments}</div>
    <p class="progress-label">${percent}% complete (${done}/${total})</p>
  `
}

/** Per-item checklist — the "Checklist" alternative view, and the on-demand list above `TASK_LIST_THRESHOLD`. */
export function renderTaskItemsHtml(tasks: TaskItem[]): string {
  const items = tasks
    .map(
      (task) => `
        <li class="task-item">
          <input type="checkbox" disabled${task.done ? ' checked' : ''}>
          <span>${task.html}</span>
        </li>
      `,
    )
    .join('')
  return `<ul class="task-list">${items}</ul>`
}

/** The disclosure wrapper, shown only above `TASK_LIST_THRESHOLD` items so thin segments still have a readable fallback. */
export function renderTaskItemsDisclosureHtml(tasks: TaskItem[]): string {
  if (tasks.length <= TASK_LIST_THRESHOLD) return ''
  return `
    <details class="task-items-disclosure">
      <summary>Show all ${tasks.length} items</summary>
      ${renderTaskItemsHtml(tasks)}
    </details>
  `
}

/**
 * Wires the shared segment tooltip. `pointerover` covers mouse hover and also
 * fires on touch tap; the explicit `click` handler makes the tap path reliable
 * where it doesn't. A pointerdown outside dismisses it — on a touch device
 * there is no pointer to move away, so without this the tooltip would stick.
 */
export function attachSegmentTooltip(root: HTMLElement): void {
  const bar = root.querySelector<HTMLElement>('.task-segments')
  if (!bar) return

  const tip = document.createElement('div')
  tip.className = 'segment-tooltip'
  tip.hidden = true
  root.appendChild(tip)

  const segmentAt = (target: EventTarget | null): HTMLElement | null =>
    (target as HTMLElement | null)?.closest<HTMLElement>('.task-segment') ?? null

  const show = (segment: HTMLElement): void => {
    tip.textContent = segment.dataset.label ?? ''
    // Unhide before measuring: a hidden element has no width to clamp against.
    tip.hidden = false

    const rootRect = root.getBoundingClientRect()
    const segmentRect = segment.getBoundingClientRect()

    // Sit below the bar rather than above it — above would cover the card's
    // heading and its toggle row.
    tip.style.top = `${segmentRect.bottom - rootRect.top + 8}px`

    // Centre on the segment, but keep the tooltip inside the card: segments at
    // either end would otherwise push it past the edge.
    const half = tip.offsetWidth / 2
    const centre = segmentRect.left - rootRect.left + segmentRect.width / 2
    tip.style.left = `${Math.min(Math.max(centre, half), rootRect.width - half)}px`
  }

  const hide = (): void => {
    tip.hidden = true
  }

  bar.addEventListener('pointerover', (event) => {
    const segment = segmentAt(event.target)
    if (segment) show(segment)
  })
  bar.addEventListener('click', (event) => {
    const segment = segmentAt(event.target)
    if (segment) show(segment)
  })
  bar.addEventListener('pointerleave', hide)
  document.addEventListener('pointerdown', (event) => {
    if (!bar.contains(event.target as Node)) hide()
  })
}
