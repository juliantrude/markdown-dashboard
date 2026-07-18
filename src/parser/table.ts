import Token from 'markdown-it/lib/token.mjs'

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
  /** First column's values — the category/label axis. */
  categories: string[]
  /** One entry per column (after the first) whose values are numeric in every row. */
  series: TableSeries[]
}

/** Strips thousands separators and a trailing `%` before parsing, e.g. "1,234" or "12%". */
function parseNumericCell(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '').replace(/%$/, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function cellText(tokens: Token[], cellOpenIndex: number): string {
  return tokens[cellOpenIndex + 1]?.content ?? ''
}

/**
 * Finds the first Markdown table in `tokens` (a card's token stream) and
 * returns its header row + body rows as plain strings, or `null` if there's
 * no table. Only the first table per card drives the chart widget, per
 * ELEMENTS.md ("the parser infers series/labels from the header row and
 * first column").
 */
function extractFirstTable(tokens: Token[]): { headers: string[]; rows: string[][] } | null {
  const tableOpen = tokens.findIndex((token) => token.type === 'table_open')
  if (tableOpen === -1) return null

  const headers: string[] = []
  const rows: string[][] = []
  let currentRow: string[] | null = null
  let inBody = false

  for (let i = tableOpen + 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'table_close') break
    if (token.type === 'tbody_open') {
      inBody = true
      continue
    }
    if (token.type === 'tr_open') {
      currentRow = []
      continue
    }
    if (token.type === 'tr_close') {
      if (currentRow && inBody) rows.push(currentRow)
      currentRow = null
      continue
    }
    if (token.type === 'th_open') {
      headers.push(cellText(tokens, i))
      continue
    }
    if (token.type === 'td_open' && currentRow) {
      currentRow.push(cellText(tokens, i))
      continue
    }
  }

  return { headers, rows }
}

/**
 * Converts a card's raw table (header + string rows) into chart-ready data:
 * the first column becomes `categories`; every other column becomes a
 * numeric `series` only if *every* row has a parseable number in it (a
 * single non-numeric cell drops that whole column, per ELEMENTS.md's
 * "only alternatives valid for the data shape").
 */
export function tableToChartData(headers: string[], rows: string[][]): TableData | null {
  if (headers.length < 2 || rows.length === 0) return null

  const categories = rows.map((row) => row[0] ?? '')
  const series: TableSeries[] = []

  for (let col = 1; col < headers.length; col++) {
    const data: number[] = []
    let allNumeric = true
    for (const row of rows) {
      const parsed = parseNumericCell(row[col] ?? '')
      if (parsed === null) {
        allNumeric = false
        break
      }
      data.push(parsed)
    }
    if (allNumeric) series.push({ label: headers[col] ?? '', data })
  }

  if (series.length === 0) return null
  return { categories, series }
}

export function extractTableData(tokens: Token[]): TableData | null {
  const table = extractFirstTable(tokens)
  if (!table) return null
  return tableToChartData(table.headers, table.rows)
}

/**
 * Which chart types the data shape supports, per ELEMENTS.md ("only those
 * matching the data shape"). Rules (decided in Increment 7, no prior source):
 * - `bar` (one bar per category): single-series tables only — a multi-series
 *   table must pick grouped or stacked instead of collapsing to one series.
 * - `bar-grouped` / `bar-stacked`: need 2+ numeric series to compare.
 * - `line` / `area` (trend/part-to-whole over an ordered axis): need 2+
 *   categories, or a single point is not a trend.
 * - `pie` / `donut` (part-to-whole by category): single-series only.
 * - `radar`: needs 3+ categories to form a meaningful polygon of axes.
 * - `scatter` (x/y pair): needs 2+ numeric series to plot one against another
 *   (only the first two are used).
 */
export function validChartTypes(table: TableData): ChartType[] {
  const { categories, series } = table
  const types: ChartType[] = []

  if (series.length === 1) types.push('bar')
  if (series.length >= 2) types.push('bar-grouped', 'bar-stacked')
  if (categories.length >= 2) types.push('line', 'area')
  if (series.length === 1 && categories.length >= 2) types.push('pie', 'donut')
  if (categories.length >= 3) types.push('radar')
  if (series.length >= 2) types.push('scatter')

  return types
}
