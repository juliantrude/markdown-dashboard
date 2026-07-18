import './style.css'
import { CHART_VIEW_META, destroyAllCharts, destroyChart, mountChart, type ChartType, type TableData } from './widgets/chart-view.js'
import { renderProgressBarHtml, renderTaskItemsHtml, taskDonutData, type TaskItem } from './widgets/tasklist-view.js'
import {
  destroyAllGauges,
  destroyGauge,
  kpiTableData,
  mountGauge,
  renderKpiTilesHtml,
  renderStatTileHtml,
  type KpiItem,
} from './widgets/kpi-view.js'
import { mountMermaid, setMermaidTheme } from './widgets/mermaid-view.js'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>Dashboard</h1>
      <button id="theme-toggle" type="button" class="theme-toggle" aria-label="Toggle color theme"></button>
    </div>
    <p id="doc-title" class="dashboard-subtitle"></p>
    <div id="content" class="dashboard-grid"></div>
  </div>
`

const docTitleEl = document.querySelector<HTMLParagraphElement>('#doc-title')!
const contentEl = document.querySelector<HTMLDivElement>('#content')!
const themeToggleEl = document.querySelector<HTMLButtonElement>('#theme-toggle')!

// --- Theme: default from prefers-color-scheme, manual toggle overrides it,
// override persists in localStorage. index.html's inline script already set
// the initial `data-theme` on <html> before first paint (avoids a flash of
// the wrong theme); this module keeps it in sync afterwards.
type Theme = 'light' | 'dark'
const THEME_STORAGE_KEY = 'md-dashboard:theme'
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')

function storedTheme(): Theme | null {
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

function systemTheme(): Theme {
  return colorSchemeQuery.matches ? 'dark' : 'light'
}

let currentTheme: Theme = storedTheme() ?? systemTheme()

let lastMessage: ContentMessage | null = null

function applyTheme(theme: Theme): void {
  currentTheme = theme
  document.documentElement.setAttribute('data-theme', theme)
  themeToggleEl.textContent = theme === 'dark' ? '🌙' : '☀️'
  themeToggleEl.setAttribute('aria-pressed', String(theme === 'dark'))
  setMermaidTheme(theme)
  // Chart colors are read from CSS custom properties at mount time (see
  // chart-view.ts) and mermaid diagrams are painted once as static SVG, so
  // neither picks up a theme change on its own — re-render whatever's on
  // screen so mounted charts/diagrams get redrawn with the new palette.
  if (lastMessage) renderCards(lastMessage)
}

themeToggleEl.addEventListener('click', () => {
  const next: Theme = currentTheme === 'dark' ? 'light' : 'dark'
  localStorage.setItem(THEME_STORAGE_KEY, next)
  applyTheme(next)
})

// Only auto-follow the system preference while the user hasn't manually
// overridden it — a stored override always wins.
colorSchemeQuery.addEventListener('change', () => {
  if (!storedTheme()) applyTheme(systemTheme())
})

applyTheme(currentTheme)

interface Card {
  heading: string
  html: string
  markdownHtml: string
  table?: TableData
  chartTypes?: ChartType[]
  tasks?: TaskItem[]
  kpi?: KpiItem[]
  metric?: KpiItem
  mermaid?: string
  chartFence?: { table: TableData; defaultType: ChartType; types: ChartType[] }
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

// Per-card widget view toggle. Every card offers its default widget render
// and the faithful "Markdown" raw-render mode, plus (Increment 7) one entry
// per chart type valid for the card's table, (Increment 8) a progress
// bar/donut pair if the card has task-list items, (Increment 9) KPI
// tiles/Bar/Pie for a numeric list or a Gauge for a lone `Metric: value`
// (whose "default" view renders a stat tile, not plain text), and
// (Increment 10) one entry per alternative chart type for a ```chart fence
// (`fence-<type>` ids, since a card could in principle also have a real
// table with overlapping type ids) — its "default" view renders the fence's
// own default type as a chart, same non-plain-text-default pattern as the
// lone metric. A ```mermaid fence has no alternatives at all: only its
// "default" view is special-cased (to the rendered diagram, mounted
// async via mermaid.render — see mountActiveView).
type WidgetKind = 'default' | 'markdown' | 'chart' | 'progress-bar' | 'progress-donut' | 'kpi-tiles' | 'kpi-bar' | 'kpi-pie' | 'gauge'

interface WidgetView {
  id: string
  label: string
  icon: string
  kind: WidgetKind
}

function viewsFor(card: Card): WidgetView[] {
  const views: WidgetView[] = [
    { id: 'default', label: 'Widget', icon: '▦', kind: 'default' },
    { id: 'markdown', label: 'Markdown', icon: '▤', kind: 'markdown' },
  ]
  for (const chartType of card.chartTypes ?? []) {
    const meta = CHART_VIEW_META[chartType]
    views.push({ id: chartType, label: meta.label, icon: meta.icon, kind: 'chart' })
  }
  if (card.tasks?.length) {
    views.push({ id: 'progress-bar', label: 'Progress bar', icon: '▬', kind: 'progress-bar' })
    views.push({ id: 'progress-donut', label: 'Progress donut', icon: '🍩', kind: 'progress-donut' })
  }
  if (card.kpi?.length) {
    views.push({ id: 'kpi-tiles', label: 'KPI tiles', icon: '🔢', kind: 'kpi-tiles' })
    views.push({ id: 'kpi-bar', label: 'Bar', icon: '📊', kind: 'kpi-bar' })
    views.push({ id: 'kpi-pie', label: 'Pie', icon: '🥧', kind: 'kpi-pie' })
  }
  if (card.metric) {
    views.push({ id: 'gauge', label: 'Gauge', icon: '⏱', kind: 'gauge' })
  }
  for (const chartType of card.chartFence?.types ?? []) {
    const meta = CHART_VIEW_META[chartType]
    views.push({ id: `fence-${chartType}`, label: meta.label, icon: meta.icon, kind: 'chart' })
  }
  return views
}

const VIEW_STORAGE_PREFIX = 'md-dashboard:view:'

/**
 * Reads the stored view id for a card and clamps it to one still valid for
 * that card's *current* shape. A stored id can go stale if the underlying
 * Markdown changed since it was picked (e.g. a table lost a column and no
 * longer offers Scatter) — falling back to 'default' instead of rendering
 * nothing keeps the toggle UI and the body in sync.
 */
function storedViewId(card: Card): string {
  const stored = localStorage.getItem(VIEW_STORAGE_PREFIX + card.heading) ?? 'default'
  const valid = viewsFor(card).some((view) => view.id === stored)
  return valid ? stored : 'default'
}

function setStoredViewId(heading: string, viewId: string): void {
  localStorage.setItem(VIEW_STORAGE_PREFIX + heading, viewId)
}

let lastCards: Card[] = []

function renderCardBody(card: Card, viewId: string): string {
  if (viewId === 'markdown') return card.markdownHtml
  const views = viewsFor(card)
  const active = views.find((view) => view.id === viewId)
  if (active?.kind === 'chart') return '<div class="chart-container"><canvas></canvas></div>'
  if (active?.kind === 'progress-bar' && card.tasks) {
    return `<div class="task-progress">${renderProgressBarHtml(card.tasks)}${renderTaskItemsHtml(card.tasks)}</div>`
  }
  if (active?.kind === 'progress-donut' && card.tasks) {
    return `<div class="task-progress"><div class="chart-container chart-container-small"><canvas></canvas></div>${renderTaskItemsHtml(card.tasks)}</div>`
  }
  if (active?.kind === 'kpi-tiles' && card.kpi) return renderKpiTilesHtml(card.kpi)
  if ((active?.kind === 'kpi-bar' || active?.kind === 'kpi-pie') && card.kpi) {
    return '<div class="chart-container"><canvas></canvas></div>'
  }
  if (active?.kind === 'gauge' && card.metric) {
    return '<div class="chart-container chart-container-gauge"><canvas></canvas></div>'
  }
  // ELEMENTS.md: a lone `Metric: value` line's *default* widget is already a
  // stat tile, not the plain paragraph text every other element's "default" is.
  if (viewId === 'default' && card.metric) return renderStatTileHtml(card.metric)
  // A ```chart fence's *default* view is the explicit chart itself, not the
  // raw config text — unless the card also has a real table, whose own
  // default (the `<table>` in card.html) takes priority.
  if (viewId === 'default' && card.chartFence && !card.table) {
    return '<div class="chart-container"><canvas></canvas></div>'
  }
  // A ```mermaid fence's *default* view is the rendered diagram; mounted
  // async in mountActiveView since mermaid.render needs a live container.
  if (viewId === 'default' && card.mermaid) return '<div class="mermaid-container"></div>'
  return card.html
}

/** Mounts (or tears down) the Chart.js instance for a card's *current* view — call after the body HTML above is already in the DOM, since Chart.js needs a live canvas element. */
function mountActiveView(card: Card, viewId: string, bodyEl: HTMLElement): void {
  const views = viewsFor(card)
  const active = views.find((view) => view.id === viewId)
  destroyChart(card.heading)
  destroyGauge(card.heading)
  const canvas = bodyEl.querySelector('canvas')
  if (viewId === 'default' && card.chartFence && !card.table) {
    mountChart(card.heading, canvas!, card.chartFence.table, card.chartFence.defaultType)
  } else if (active?.kind === 'chart' && card.chartFence && viewId.startsWith('fence-')) {
    mountChart(card.heading, canvas!, card.chartFence.table, viewId.slice('fence-'.length) as ChartType)
  } else if (active?.kind === 'chart' && card.table) {
    mountChart(card.heading, canvas!, card.table, active.id as ChartType)
  } else if (active?.kind === 'progress-donut' && card.tasks) {
    mountChart(card.heading, canvas!, taskDonutData(card.tasks), 'donut')
  } else if (active?.kind === 'kpi-bar' && card.kpi) {
    mountChart(card.heading, canvas!, kpiTableData(card.kpi), 'bar')
  } else if (active?.kind === 'kpi-pie' && card.kpi) {
    mountChart(card.heading, canvas!, kpiTableData(card.kpi), 'pie')
  } else if (active?.kind === 'gauge' && card.metric) {
    mountGauge(card.heading, canvas!, card.metric)
  } else if (viewId === 'default' && card.mermaid) {
    const container = bodyEl.querySelector<HTMLElement>('.mermaid-container')
    if (container) void mountMermaid(card.heading, container, card.mermaid)
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

function renderCards(message: ContentMessage): void {
  const { title, cards } = message
  lastMessage = message
  lastCards = cards
  docTitleEl.textContent = title
  // The whole grid (and every canvas in it) is about to be discarded — tear
  // down existing Chart.js instances first so none are left mounted on
  // detached canvases.
  destroyAllCharts()
  destroyAllGauges()

  if (cards.length === 0) {
    contentEl.innerHTML = `<p class="empty-state">No sections found. Add a "## Heading" to your Markdown file to create a card.</p>`
    return
  }

  contentEl.innerHTML = cards
    .map((card) => {
      const viewId = storedViewId(card)
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
    if (bodyEl) mountActiveView(card, storedViewId(card), bodyEl)
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
