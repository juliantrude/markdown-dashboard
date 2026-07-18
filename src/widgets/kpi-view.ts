import { Chart, type ChartConfiguration } from 'chart.js'
import type { TableData } from './chart-view.js'

export interface KpiItem {
  label: string
  value: number
  isPercent: boolean
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function formatValue(item: KpiItem): string {
  const formatted = new Intl.NumberFormat().format(item.value)
  return item.isPercent ? `${formatted}%` : formatted
}

/** Numeric-list -> KPI stat tiles (ELEMENTS.md "Stat tiles (KPI)"), one tile per `Key: value` item. */
export function renderKpiTilesHtml(items: KpiItem[]): string {
  const tiles = items
    .map(
      (item) => `
        <div class="kpi-tile">
          <p class="kpi-value">${formatValue(item)}</p>
          <p class="kpi-label">${escapeHtml(item.label)}</p>
        </div>
      `,
    )
    .join('')
  return `<div class="kpi-grid">${tiles}</div>`
}

/** Reshapes KPI items into `TableData` so the Bar/Pie alternatives reuse chart-view's existing builders. */
export function kpiTableData(items: KpiItem[]): TableData {
  return { categories: items.map((item) => item.label), series: [{ label: 'Value', data: items.map((item) => item.value) }] }
}

/** Single stat tile (default widget for a lone `Metric: value` line, ELEMENTS.md). */
export function renderStatTileHtml(item: KpiItem): string {
  return `
    <div class="kpi-tile kpi-tile-single">
      <p class="kpi-value">${formatValue(item)}</p>
      <p class="kpi-label">${escapeHtml(item.label)}</p>
    </div>
  `
}

/**
 * Gauge max isn't given by the source Markdown, so it's inferred (decided this
 * increment, no prior source): a `%` value maxes at 100; otherwise the next
 * power of ten strictly above the value (minimum 10) keeps the needle clear of
 * the end stop for any plausible metric.
 */
export function computeGaugeMax(item: KpiItem): number {
  if (item.isPercent) return 100
  if (item.value <= 0) return 10
  const magnitude = Math.pow(10, Math.ceil(Math.log10(item.value)))
  return item.value < magnitude ? magnitude : magnitude * 10
}

const gaugesByHeading = new Map<string, Chart>()

function gaugeCenterTextPlugin(item: KpiItem) {
  return {
    id: 'gaugeCenterText',
    afterDraw(chart: Chart): void {
      const { ctx, chartArea } = chart
      const centerX = (chartArea.left + chartArea.right) / 2
      const centerY = chartArea.bottom
      ctx.save()
      ctx.textAlign = 'center'
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--chart-text-primary').trim()
      ctx.font = 'bold 1.5rem sans-serif'
      ctx.fillText(formatValue(item), centerX, centerY)
      ctx.restore()
    },
  }
}

/** Mounts a half-circle gauge (Chart.js doughnut hack: 180deg circumference, value + remainder-to-max segments) for a single metric. */
export function mountGauge(heading: string, canvas: HTMLCanvasElement, item: KpiItem): void {
  destroyGauge(heading)
  const max = computeGaugeMax(item)
  const remainder = Math.max(max - item.value, 0)
  const valueColor = getComputedStyle(document.documentElement).getPropertyValue('--series-1').trim()
  const trackColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim()

  const config: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: [item.label, ''],
      datasets: [{ data: [item.value, remainder], backgroundColor: [valueColor, trackColor], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      circumference: 180,
      rotation: 270,
      cutout: '75%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
    plugins: [gaugeCenterTextPlugin(item)],
  }
  const chart = new Chart(canvas, config)
  gaugesByHeading.set(heading, chart)
}

export function destroyGauge(heading: string): void {
  gaugesByHeading.get(heading)?.destroy()
  gaugesByHeading.delete(heading)
}

export function destroyAllGauges(): void {
  for (const heading of gaugesByHeading.keys()) destroyGauge(heading)
}
