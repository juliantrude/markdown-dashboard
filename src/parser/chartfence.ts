import Token from 'markdown-it/lib/token.mjs'
import { parse as parseYaml } from 'yaml'
import { validChartTypes, type ChartType, type TableData, type TableSeries } from './table.js'

export interface ChartFence {
  table: TableData
  defaultType: ChartType
  /** Alternatives beyond `defaultType`, valid for this data's shape (ELEMENTS.md: "may still offer the shape-valid alternatives"). */
  types: ChartType[]
}

interface ChartFenceConfig {
  type?: unknown
  categories?: unknown
  series?: unknown
}

function parseConfig(raw: string): ChartFenceConfig | null {
  try {
    return JSON.parse(raw) as ChartFenceConfig
  } catch {
    // Fall through to YAML — JSON is a YAML subset, so this only helps
    // genuine YAML (block mappings, unquoted keys, etc).
  }
  try {
    const parsed: unknown = parseYaml(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as ChartFenceConfig) : null
  } catch {
    return null
  }
}

function toTableData(config: ChartFenceConfig): TableData | null {
  if (!Array.isArray(config.categories) || config.categories.length === 0) return null
  if (!Array.isArray(config.series) || config.series.length === 0) return null

  const categories = config.categories.map(String)
  const series: TableSeries[] = []

  for (const entry of config.series) {
    if (typeof entry !== 'object' || entry === null) return null
    const { label, data } = entry as { label?: unknown; data?: unknown }
    if (typeof label !== 'string' || !Array.isArray(data) || data.length !== categories.length) return null
    if (!data.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
    series.push({ label, data: data as number[] })
  }

  return { categories, series }
}

/**
 * Finds the first ```chart fenced code block (JSON or YAML) in a card's
 * token stream and, if its config parses into a valid `TableData` shape,
 * returns the chart-ready data plus its default chart type and the other
 * types valid for that shape. Malformed config (bad JSON/YAML, missing
 * categories/series, mismatched lengths, non-numeric data) yields
 * `undefined` — the card falls back to its plain fenced-code default render,
 * the same "only alternatives valid for the data shape" rule `table.ts`
 * follows for a mismatched table column.
 *
 * Config shape (invented this increment, no prior source):
 * ```json
 * { "type": "bar", "categories": ["Jan", "Feb"], "series": [{ "label": "Sales", "data": [10, 20] }] }
 * ```
 * `type` is optional; if omitted or not valid for the shape, the first
 * shape-valid type (`table.ts`'s `validChartTypes` order) is used instead.
 */
export function extractChartFence(tokens: Token[]): ChartFence | undefined {
  const fence = tokens.find(
    (token) => token.type === 'fence' && token.info.trim().split(/\s+/)[0]?.toLowerCase() === 'chart',
  )
  if (!fence) return undefined

  const config = parseConfig(fence.content)
  if (!config) return undefined

  const table = toTableData(config)
  if (!table) return undefined

  const validTypes = validChartTypes(table)
  if (validTypes.length === 0) return undefined

  const requested = typeof config.type === 'string' ? (config.type as ChartType) : undefined
  const defaultType = requested && validTypes.includes(requested) ? requested : validTypes[0]!
  const types = validTypes.filter((type) => type !== defaultType)

  return { table, defaultType, types }
}
