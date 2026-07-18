import './style.css'
import { CHART_VIEW_META, destroyAllCharts, destroyChart, mountChart, type ChartType, type TableData } from './widgets/chart-view.js'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="dashboard">
    <h1>Dashboard</h1>
    <p id="doc-title" class="dashboard-subtitle"></p>
    <div id="content" class="dashboard-grid"></div>
  </div>
`

const docTitleEl = document.querySelector<HTMLParagraphElement>('#doc-title')!
const contentEl = document.querySelector<HTMLDivElement>('#content')!

interface Card {
  heading: string
  html: string
  markdownHtml: string
  table?: TableData
  chartTypes?: ChartType[]
}

interface ContentMessage {
  type: 'content'
  title: string
  cards: Card[]
}

function isContentMessage(value: unknown): value is ContentMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'content' &&
    typeof (value as { title?: unknown }).title === 'string' &&
    Array.isArray((value as { cards?: unknown }).cards)
  )
}

// Per-card widget view toggle. Increments 8-10 will register more view ids
// (progress, KPI, ...); every card offers its default widget render and the
// faithful "Markdown" raw-render mode, plus (Increment 7) one entry per chart
// type valid for the card's table, if it has one.
interface WidgetView {
  id: string
  label: string
  icon: string
  isChart: boolean
}

function viewsFor(card: Card): WidgetView[] {
  const views: WidgetView[] = [
    { id: 'default', label: 'Widget', icon: '▦', isChart: false },
    { id: 'markdown', label: 'Markdown', icon: '▤', isChart: false },
  ]
  for (const chartType of card.chartTypes ?? []) {
    const meta = CHART_VIEW_META[chartType]
    views.push({ id: chartType, label: meta.label, icon: meta.icon, isChart: true })
  }
  return views
}

const VIEW_STORAGE_PREFIX = 'md-dashboard:view:'

function storedViewId(heading: string): string {
  return localStorage.getItem(VIEW_STORAGE_PREFIX + heading) ?? 'default'
}

function setStoredViewId(heading: string, viewId: string): void {
  localStorage.setItem(VIEW_STORAGE_PREFIX + heading, viewId)
}

let lastCards: Card[] = []

function renderCardBody(card: Card, viewId: string): string {
  if (viewId === 'markdown') return card.markdownHtml
  const views = viewsFor(card)
  const active = views.find((view) => view.id === viewId)
  if (active?.isChart) return '<div class="chart-container"><canvas></canvas></div>'
  return card.html
}

/** Mounts (or tears down) the Chart.js instance for a card's *current* view — call after the body HTML above is already in the DOM, since Chart.js needs a live canvas element. */
function mountActiveView(card: Card, viewId: string, bodyEl: HTMLElement): void {
  const views = viewsFor(card)
  const active = views.find((view) => view.id === viewId)
  if (active?.isChart && card.table) {
    const canvas = bodyEl.querySelector('canvas')!
    mountChart(card.heading, canvas, card.table, active.id as ChartType)
  } else {
    destroyChart(card.heading)
  }
}

function renderToggle(card: Card, viewId: string): string {
  const views = viewsFor(card)
  const buttons = views
    .map(
      (view) => `
        <button
          type="button"
          class="toggle-btn"
          data-view="${view.id}"
          aria-pressed="${view.id === viewId}"
          title="${escapeHtml(view.label)}"
        >${view.icon}</button>
      `,
    )
    .join('')
  return `<div class="card-toggle" role="group" aria-label="View">${buttons}</div>`
}

function renderCards({ title, cards }: ContentMessage): void {
  lastCards = cards
  docTitleEl.textContent = title
  // The whole grid (and every canvas in it) is about to be discarded — tear
  // down existing Chart.js instances first so none are left mounted on
  // detached canvases.
  destroyAllCharts()
  contentEl.innerHTML = cards
    .map((card) => {
      const viewId = storedViewId(card.heading)
      return `
        <section class="card" data-heading="${escapeHtml(card.heading)}">
          <div class="card-header">
            <h2 class="card-heading">${escapeHtml(card.heading)}</h2>
            ${renderToggle(card, viewId)}
          </div>
          <div class="card-body">${renderCardBody(card, viewId)}</div>
        </section>
      `
    })
    .join('')

  // Sections were just built in the same order as `cards`, so zip by index
  // rather than re-querying by heading (headings aren't guaranteed unique).
  const sections = contentEl.querySelectorAll<HTMLElement>('.card')
  cards.forEach((card, index) => {
    const bodyEl = sections[index]?.querySelector<HTMLElement>('.card-body')
    if (bodyEl) mountActiveView(card, storedViewId(card.heading), bodyEl)
  })
}

// Event delegation: one listener survives every full-grid re-render from
// live reload, so toggle buttons never need re-binding after each rebuild.
contentEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.toggle-btn')
  if (!button) return

  const section = button.closest<HTMLElement>('.card')
  const heading = section?.dataset.heading
  const viewId = button.dataset.view
  if (!heading || !viewId) return

  const card = lastCards.find((candidate) => candidate.heading === heading)
  if (!card) return

  setStoredViewId(heading, viewId)
  section!.querySelector('.card-toggle')!.outerHTML = renderToggle(card, viewId)
  const bodyEl = section!.querySelector<HTMLElement>('.card-body')!
  bodyEl.innerHTML = renderCardBody(card, viewId)
  mountActiveView(card, viewId, bodyEl)
})

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

// Reconnects on drop (e.g. server restart) so live reload keeps working
// without a manual page refresh.
function connectLiveReload(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${protocol}//${location.host}/ws`)

  socket.addEventListener('message', (event) => {
    const message: unknown = JSON.parse(event.data as string)
    if (isContentMessage(message)) renderCards(message)
  })

  socket.addEventListener('close', () => {
    setTimeout(connectLiveReload, 1000)
  })
}

connectLiveReload()
