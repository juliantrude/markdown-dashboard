import { Chart, type ChartConfiguration, registerables } from 'chart.js'

Chart.register(...registerables)

export type ChartType =
  | 'bar'
  | 'bar-grouped'
  | 'bar-stacked'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'radar'
  | 'scatter'

export interface TableSeries {
  label: string
  data: number[]
}

export interface TableData {
  categories: string[]
  series: TableSeries[]
}

export const CHART_VIEW_META: Record<ChartType, { label: string; icon: string }> = {
  bar: { label: 'Bar', icon: '📊' },
  'bar-grouped': { label: 'Grouped Bar', icon: '📊' },
  'bar-stacked': { label: 'Stacked Bar', icon: '📚' },
  line: { label: 'Line', icon: '📈' },
  area: { label: 'Area', icon: '🏔' },
  pie: { label: 'Pie', icon: '🥧' },
  donut: { label: 'Donut', icon: '🍩' },
  radar: { label: 'Radar', icon: '🕸' },
  scatter: { label: 'Scatter', icon: '⚬' },
}

/**
 * Fixed categorical hue order (dataviz skill's validated palette, read from
 * the CSS custom properties in style.css so light/dark tracks the page).
 * Never cycled past 8 slots — callers must fold overflow into "Other" via
 * `foldToOther` before this is used, per the skill's non-negotiables.
 */
const MAX_CATEGORICAL_SLOTS = 8

function seriesColor(index: number): string {
  const slot = Math.min(index, MAX_CATEGORICAL_SLOTS - 1) + 1
  return getComputedStyle(document.documentElement).getPropertyValue(`--series-${slot}`).trim()
}

function chartTextColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--chart-text-secondary').trim()
}

function gridColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim()
}

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return hex
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Sums entries past the first `MAX_CATEGORICAL_SLOTS - 1` into a trailing "Other", per the skill's series-count ladder. */
function foldToOther(labels: string[], values: number[]): { labels: string[]; values: number[] } {
  if (labels.length <= MAX_CATEGORICAL_SLOTS) return { labels, values }
  const kept = MAX_CATEGORICAL_SLOTS - 1
  const otherTotal = values.slice(kept).reduce((sum, value) => sum + value, 0)
  return {
    labels: [...labels.slice(0, kept), 'Other'],
    values: [...values.slice(0, kept), otherTotal],
  }
}

function baseOptions(showLegend: boolean) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: showLegend, labels: { color: chartTextColor() } },
      tooltip: { enabled: true },
    },
  }
}

function categoryScales() {
  return {
    x: { ticks: { color: chartTextColor() }, grid: { color: gridColor() } },
    y: { ticks: { color: chartTextColor() }, grid: { color: gridColor() }, beginAtZero: true },
  }
}

function buildBarLikeConfig(table: TableData, type: 'bar' | 'bar-grouped' | 'bar-stacked'): ChartConfiguration {
  const stacked = type === 'bar-stacked'
  return {
    type: 'bar',
    data: {
      labels: table.categories,
      datasets: table.series.map((series, index) => ({
        label: series.label,
        data: series.data,
        backgroundColor: seriesColor(index),
        borderRadius: 4,
        maxBarThickness: 24,
      })),
    },
    options: {
      ...baseOptions(table.series.length >= 2),
      scales: {
        x: { ...categoryScales().x, stacked },
        y: { ...categoryScales().y, stacked },
      },
    },
  }
}

function buildLineLikeConfig(table: TableData, type: 'line' | 'area'): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels: table.categories,
      datasets: table.series.map((series, index) => {
        const color = seriesColor(index)
        return {
          label: series.label,
          data: series.data,
          borderColor: color,
          backgroundColor: type === 'area' ? hexToRgba(color, 0.1) : color,
          fill: type === 'area',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: color,
        }
      }),
    },
    options: {
      ...baseOptions(table.series.length >= 2),
      scales: categoryScales(),
    },
  }
}

function buildPieLikeConfig(table: TableData, type: 'pie' | 'donut'): ChartConfiguration {
  const { labels, values } = foldToOther(table.categories, table.series[0]?.data ?? [])
  return {
    type: type === 'donut' ? 'doughnut' : 'pie',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, index) => seriesColor(index)),
        },
      ],
    },
    options: baseOptions(true),
  }
}

function buildRadarConfig(table: TableData): ChartConfiguration {
  return {
    type: 'radar',
    data: {
      labels: table.categories,
      datasets: table.series.map((series, index) => {
        const color = seriesColor(index)
        return {
          label: series.label,
          data: series.data,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.1),
          pointBackgroundColor: color,
          borderWidth: 2,
        }
      }),
    },
    options: {
      ...baseOptions(table.series.length >= 2),
      scales: {
        r: {
          ticks: { color: chartTextColor(), backdropColor: 'transparent' },
          grid: { color: gridColor() },
          pointLabels: { color: chartTextColor() },
        },
      },
    },
  }
}

function buildScatterConfig(table: TableData): ChartConfiguration {
  const [x, y] = table.series
  const points = (x?.data ?? []).map((value, index) => ({ x: value, y: y?.data[index] ?? 0 }))
  const color = seriesColor(0)
  return {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: `${x?.label ?? 'x'} vs ${y?.label ?? 'y'}`,
          data: points,
          backgroundColor: color,
          borderColor: color,
          pointRadius: 4,
        },
      ],
    },
    options: {
      ...baseOptions(false),
      scales: {
        x: { ...categoryScales().x, type: 'linear', title: { display: true, text: x?.label ?? '', color: chartTextColor() } },
        y: { ...categoryScales().y, title: { display: true, text: y?.label ?? '', color: chartTextColor() } },
      },
    },
  }
}

function buildConfig(table: TableData, type: ChartType): ChartConfiguration {
  switch (type) {
    case 'bar':
    case 'bar-grouped':
    case 'bar-stacked':
      return buildBarLikeConfig(table, type)
    case 'line':
    case 'area':
      return buildLineLikeConfig(table, type)
    case 'pie':
    case 'donut':
      return buildPieLikeConfig(table, type)
    case 'radar':
      return buildRadarConfig(table)
    case 'scatter':
      return buildScatterConfig(table)
  }
}

const chartsByHeading = new Map<string, Chart>()

/** Destroys the previously mounted chart (if any) for `heading` — call this on every re-render/view switch to avoid leaking Chart.js instances tied to detached canvases. */
export function destroyChart(heading: string): void {
  chartsByHeading.get(heading)?.destroy()
  chartsByHeading.delete(heading)
}

/** Destroys every tracked chart — call before a full-grid rebuild (live reload), since it discards every existing canvas. */
export function destroyAllCharts(): void {
  for (const heading of chartsByHeading.keys()) destroyChart(heading)
}

/** Mounts a Chart.js chart of `type` into `canvas`, replacing any prior chart registered under `heading`. */
export function mountChart(heading: string, canvas: HTMLCanvasElement, table: TableData, type: ChartType): void {
  destroyChart(heading)
  const chart = new Chart(canvas, buildConfig(table, type))
  chartsByHeading.set(heading, chart)
}
