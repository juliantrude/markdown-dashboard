import './style.css'
import {
  CHART_VIEW_META,
  destroyAllCharts,
  destroyChart,
  mountChart,
  mountTaskChart,
  type ChartType,
  type TableData,
} from './widgets/chart-view.js'
import {
  attachSegmentTooltip,
  renderProgressBarHtml,
  renderTaskItemsDisclosureHtml,
  renderTaskItemsHtml,
  taskLabel,
  type TaskItem,
} from './widgets/tasklist-view.js'
import {
  destroyAllGauges,
  destroyGauge,
  kpiTableData,
  mountGauge,
  renderKpiListHtml,
  renderKpiTilesHtml,
  renderStatTileHtml,
  type KpiItem,
} from './widgets/kpi-view.js'
import { mountMermaid, setMermaidTheme } from './widgets/mermaid-view.js'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="dashboard">
    <div class="dashboard-header">
      <h1>Dashboard</h1>
      <div class="dashboard-actions">
        <button id="markdown-toggle" type="button" class="theme-toggle" aria-label="Show original Markdown" title="Show original Markdown">▤</button>
        <button id="theme-toggle" type="button" class="theme-toggle" aria-label="Toggle color theme"></button>
      </div>
    </div>
    <div class="dashboard-body">
      <nav id="file-nav" class="file-nav" aria-label="Markdown files" hidden></nav>
      <div class="dashboard-main">
        <p id="doc-title" class="dashboard-subtitle"></p>
        <div id="content" class="dashboard-grid"></div>
      </div>
    </div>
  </div>
`

const docTitleEl = document.querySelector<HTMLParagraphElement>('#doc-title')!
const contentEl = document.querySelector<HTMLDivElement>('#content')!
const themeToggleEl = document.querySelector<HTMLButtonElement>('#theme-toggle')!
const fileNavEl = document.querySelector<HTMLElement>('#file-nav')!
const markdownToggleEl = document.querySelector<HTMLButtonElement>('#markdown-toggle')!

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
  /** Top-level paragraphs only — rendered as the clamped caption under a chart. */
  prose?: string
  /** The card's table on its own, for the "Table" alternative view. */
  tableHtml?: string
  table?: TableData
  chartTypes?: ChartType[]
  /** Chart-first default for this table, chosen server-side from the data shape. */
  defaultChartType?: ChartType
  tasks?: TaskItem[]
  kpi?: KpiItem[]
  metric?: KpiItem
  mermaid?: string
  chartFence?: { table: TableData; defaultType: ChartType; types: ChartType[] }
}

interface ContentMessage {
  type: 'content'
  file: string
  title: string
  cards: Card[]
}

function isContentMessage(value: unknown): value is ContentMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'content' &&
    typeof (value as { file?: unknown }).file === 'string' &&
    typeof (value as { title?: unknown }).title === 'string' &&
    Array.isArray((value as { cards?: unknown }).cards)
  )
}

interface FilesMessage {
  type: 'files'
  files: string[]
}

function isFilesMessage(value: unknown): value is FilesMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'files' &&
    Array.isArray((value as { files?: unknown }).files)
  )
}

// Folder support (Increment 13): the server always sends a `files` list (one
// entry in single-file mode too — single-file is just folder mode with one
// file) followed by one `content` message per file. `documents` caches the
// last content pushed for every file so switching the sidebar selection is
// instant, with no round-trip; only the currently `selectedFile`'s cards are
// ever rendered into `#content`. The sidebar itself only renders once there's
// more than one file, so single-file mode's DOM/UX is unchanged.
const SELECTED_FILE_STORAGE_KEY = 'md-dashboard:selectedFile'
const documents = new Map<string, ContentMessage>()
let knownFiles: string[] = []
let selectedFile: string | null = null

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
type WidgetKind =
  | 'default'
  | 'markdown'
  | 'chart'
  | 'table'
  | 'progress-bar'
  | 'progress-donut'
  | 'checklist'
  | 'kpi-tiles'
  | 'kpi-bar'
  | 'kpi-pie'
  | 'kpi-list'
  | 'gauge'

interface WidgetView {
  id: string
  label: string
  icon: string
  kind: WidgetKind
}

/**
 * Whether the card has a shape worth visualising. Chart-first (ELEMENTS.md v2)
 * only applies to these: a card with none of them has nothing to chart, so it
 * stays a (de-emphasised) text card instead of being forced into a widget.
 */
function isChartable(card: Card): boolean {
  return Boolean(card.table || card.tasks?.length || card.kpi?.length || card.metric || card.mermaid || card.chartFence)
}

function viewsFor(card: Card): WidgetView[] {
  const views: WidgetView[] = [
    { id: 'default', label: 'Default', icon: '▦', kind: 'default' },
    { id: 'markdown', label: 'Markdown', icon: '▤', kind: 'markdown' },
  ]
  for (const chartType of card.chartTypes ?? []) {
    const meta = CHART_VIEW_META[chartType]
    views.push({ id: chartType, label: meta.label, icon: meta.icon, kind: 'chart' })
  }
  // Chart-first inverts the old default: the table is now an *alternative* to
  // the chart, not the other way round.
  if (card.tableHtml) {
    views.push({ id: 'table', label: 'Table', icon: '▦', kind: 'table' })
  }
  if (card.tasks?.length) {
    views.push({ id: 'progress-bar', label: 'Progress bar', icon: '▬', kind: 'progress-bar' })
    views.push({ id: 'progress-donut', label: 'Progress donut', icon: '🍩', kind: 'progress-donut' })
    views.push({ id: 'checklist', label: 'Checklist', icon: '☑', kind: 'checklist' })
  }
  if (card.kpi?.length) {
    views.push({ id: 'kpi-tiles', label: 'KPI tiles', icon: '🔢', kind: 'kpi-tiles' })
    views.push({ id: 'kpi-bar', label: 'Bar', icon: '📊', kind: 'kpi-bar' })
    views.push({ id: 'kpi-pie', label: 'Pie', icon: '🥧', kind: 'kpi-pie' })
    views.push({ id: 'kpi-list', label: 'List', icon: '☰', kind: 'kpi-list' })
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

const CHART_CANVAS = '<div class="chart-container"><canvas></canvas></div>'

/**
 * Wraps text in the 2-line clamp with its "Read more" control (ELEMENTS.md v2).
 * The button ships hidden and is only revealed by `wireReadMore` for text that
 * actually overflows — otherwise short captions would carry a pointless control.
 */
function clampHtml(inner: string, extraClass: string): string {
  return `
    <div class="clamp ${extraClass}">
      <div class="clamp-body">${inner}</div>
      <button type="button" class="read-more" hidden>Read more</button>
    </div>
  `
}

/** The caption under a chart: the card's prose, clamped. Empty when the card has no top-level prose. */
function renderCaptionHtml(card: Card): string {
  return card.prose ? clampHtml(card.prose, 'card-caption') : ''
}

/**
 * The card's widget markup, or `null` when the card has nothing chartable —
 * that case falls through to a de-emphasised prose card instead.
 */
function renderWidget(card: Card, viewId: string): string | null {
  const active = viewsFor(card).find((view) => view.id === viewId)

  if (active?.kind === 'chart') return CHART_CANVAS
  if (active?.kind === 'table' && card.tableHtml) return card.tableHtml
  if (active?.kind === 'checklist' && card.tasks) return renderTaskItemsHtml(card.tasks)
  if (active?.kind === 'progress-bar' && card.tasks) {
    return `<div class="task-progress">${renderProgressBarHtml(card.tasks)}${renderTaskItemsDisclosureHtml(card.tasks)}</div>`
  }
  if (active?.kind === 'progress-donut' && card.tasks) {
    return `<div class="task-progress"><div class="chart-container chart-container-small"><canvas></canvas></div>${renderTaskItemsDisclosureHtml(card.tasks)}</div>`
  }
  if (active?.kind === 'kpi-tiles' && card.kpi) return renderKpiTilesHtml(card.kpi)
  if (active?.kind === 'kpi-list' && card.kpi) return renderKpiListHtml(card.kpi)
  if ((active?.kind === 'kpi-bar' || active?.kind === 'kpi-pie') && card.kpi) return CHART_CANVAS
  if (active?.kind === 'gauge' && card.metric) {
    return '<div class="chart-container chart-container-gauge"><canvas></canvas></div>'
  }

  if (viewId === 'default') {
    // Chart-first: a table's default view is the auto-chosen chart, not the
    // `<table>` it came from (which is now the "Table" alternative).
    if (card.table && card.defaultChartType) return CHART_CANVAS
    if (card.tasks?.length) {
      return `<div class="task-progress">${renderProgressBarHtml(card.tasks)}${renderTaskItemsDisclosureHtml(card.tasks)}</div>`
    }
    if (card.kpi?.length) return renderKpiTilesHtml(card.kpi)
    if (card.metric) return renderStatTileHtml(card.metric)
    // A ```chart fence's default view is the explicit chart itself, unless the
    // card also has a real table, whose own default chart takes priority.
    if (card.chartFence && !card.table) return CHART_CANVAS
    // A ```mermaid fence's default view is the rendered diagram; mounted async
    // in mountActiveView since mermaid.render needs a live container.
    if (card.mermaid) return '<div class="mermaid-container"></div>'
  }

  return null
}

function renderCardBody(card: Card, viewId: string): string {
  // The Markdown view is the transparency view — it shows everything, in full,
  // unclamped. Clamping the very thing the user opened to inspect would defeat it.
  if (viewId === 'markdown') return card.markdownHtml

  const widget = renderWidget(card, viewId)
  // Nothing chartable: the card *is* the text, de-emphasised and clamped.
  if (widget === null) return clampHtml(card.html, 'card-prose-body')
  return widget + renderCaptionHtml(card)
}

/**
 * Reveals a "Read more" control only for clamped text that actually overflows,
 * and wires it to expand/collapse inline. Must run *after* the body is in the
 * DOM: whether 2 lines overflow is a layout question, so it can only be
 * measured once the element has been laid out at its real card width.
 */
function wireReadMore(root: HTMLElement): void {
  for (const clamp of root.querySelectorAll<HTMLElement>('.clamp')) {
    const body = clamp.querySelector<HTMLElement>('.clamp-body')
    const button = clamp.querySelector<HTMLButtonElement>('.read-more')
    if (!body || !button) continue

    if (body.scrollHeight <= body.clientHeight + 1) {
      button.hidden = true
      continue
    }

    button.hidden = false
    button.addEventListener('click', () => {
      const expanded = clamp.classList.toggle('expanded')
      button.textContent = expanded ? 'Read less' : 'Read more'
    })
  }
}

/** Mounts (or tears down) the Chart.js instance for a card's *current* view — call after the body HTML above is already in the DOM, since Chart.js needs a live canvas element. */
function mountActiveView(card: Card, viewId: string, bodyEl: HTMLElement): void {
  const active = viewsFor(card).find((view) => view.id === viewId)
  destroyChart(card.heading)
  destroyGauge(card.heading)
  const canvas = bodyEl.querySelector('canvas')
  const segmentsOf = (tasks: TaskItem[]) => tasks.map((task) => ({ label: taskLabel(task), done: task.done }))

  // Chart-first: a table card's default view mounts its auto-chosen chart, and
  // takes priority over a ```chart fence in the same card (as renderWidget does).
  if (viewId === 'default' && card.table && card.defaultChartType) {
    mountChart(card.heading, canvas!, card.table, card.defaultChartType)
  } else if (viewId === 'default' && card.chartFence && !card.table) {
    mountChart(card.heading, canvas!, card.chartFence.table, card.chartFence.defaultType)
  } else if (active?.kind === 'chart' && card.chartFence && viewId.startsWith('fence-')) {
    mountChart(card.heading, canvas!, card.chartFence.table, viewId.slice('fence-'.length) as ChartType)
  } else if (active?.kind === 'chart' && card.table) {
    mountChart(card.heading, canvas!, card.table, active.id as ChartType)
  } else if (active?.kind === 'progress-donut' && card.tasks) {
    mountTaskChart(card.heading, canvas!, segmentsOf(card.tasks), 'donut')
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

  // The segmented bar is plain DOM rather than Chart.js, so it needs its own
  // tooltip wiring — and it shows up both as the explicit "Progress bar" view
  // and as the chart-first default for any task card.
  const progress = bodyEl.querySelector<HTMLElement>('.task-progress')
  if (progress?.querySelector('.task-segments')) attachSegmentTooltip(progress)

  wireReadMore(bodyEl)
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

// Global transparency view (ELEMENTS.md v2): the second tier alongside each
// card's own Markdown mode — shows the whole original document at once, so the
// source can be checked without opening every card individually.
const DOCUMENT_MARKDOWN_STORAGE_KEY = 'md-dashboard:documentMarkdown'
let showDocumentMarkdown = localStorage.getItem(DOCUMENT_MARKDOWN_STORAGE_KEY) === 'true'

function applyMarkdownToggleState(): void {
  markdownToggleEl.setAttribute('aria-pressed', String(showDocumentMarkdown))
  markdownToggleEl.title = showDocumentMarkdown ? 'Show dashboard' : 'Show original Markdown'
}

markdownToggleEl.addEventListener('click', () => {
  showDocumentMarkdown = !showDocumentMarkdown
  localStorage.setItem(DOCUMENT_MARKDOWN_STORAGE_KEY, String(showDocumentMarkdown))
  applyMarkdownToggleState()
  if (lastMessage) renderCards(lastMessage)
})

applyMarkdownToggleState()

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
    contentEl.className = 'dashboard-grid'
    contentEl.innerHTML = `<p class="empty-state">No sections found. Add a "## Heading" to your Markdown file to create a card.</p>`
    return
  }

  if (showDocumentMarkdown) {
    contentEl.className = 'dashboard-document'
    contentEl.innerHTML = cards
      .map((card) => `<h2>${escapeHtml(card.heading)}</h2>${card.markdownHtml}`)
      .join('')
    return
  }

  contentEl.className = 'dashboard-grid'
  contentEl.innerHTML = cards
    .map((card) => {
      const viewId = storedViewId(card)
      // Prose-only cards are de-emphasised so charts dominate the grid, but
      // they are still shown — content is never silently dropped.
      const proseClass = isChartable(card) ? '' : ' card-prose'
      return `
        <section class="card${proseClass}" data-heading="${escapeHtml(card.heading)}" data-default-chart="${card.defaultChartType ?? ''}">
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

function renderFileNav(): void {
  // Single-file mode (the common case) shows no sidebar at all, so its
  // layout/DOM is unchanged from before folder support.
  if (knownFiles.length <= 1) {
    fileNavEl.hidden = true
    fileNavEl.innerHTML = ''
    return
  }
  fileNavEl.hidden = false
  fileNavEl.innerHTML = knownFiles
    .map(
      (file) => `
        <button type="button" class="file-nav-btn" data-file="${escapeHtml(file)}" aria-pressed="${file === selectedFile}">
          ${escapeHtml(file)}
        </button>
      `,
    )
    .join('')
}

function selectFile(file: string): void {
  if (file === selectedFile) return
  selectedFile = file
  localStorage.setItem(SELECTED_FILE_STORAGE_KEY, file)
  renderFileNav()
  const doc = documents.get(file)
  if (doc) renderCards(doc)
}

fileNavEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.file-nav-btn')
  if (button?.dataset.file) selectFile(button.dataset.file)
})

function handleFilesMessage(message: FilesMessage): void {
  knownFiles = message.files
  if (!selectedFile || !knownFiles.includes(selectedFile)) {
    const stored = localStorage.getItem(SELECTED_FILE_STORAGE_KEY)
    selectedFile = (stored && knownFiles.includes(stored) ? stored : knownFiles[0]) ?? null
  }
  renderFileNav()
}

function handleContentMessage(message: ContentMessage): void {
  documents.set(message.file, message)
  if (message.file === selectedFile) renderCards(message)
}

// Reconnects on drop (e.g. server restart) so live reload keeps working
// without a manual page refresh.
function connectLiveReload(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${protocol}//${location.host}/ws`)

  socket.addEventListener('message', (event) => {
    const message: unknown = JSON.parse(event.data as string)
    if (isFilesMessage(message)) handleFilesMessage(message)
    else if (isContentMessage(message)) handleContentMessage(message)
  })

  socket.addEventListener('close', () => {
    setTimeout(connectLiveReload, 1000)
  })
}

connectLiveReload()
