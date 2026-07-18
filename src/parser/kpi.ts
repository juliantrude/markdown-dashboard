import Token from 'markdown-it/lib/token.mjs'

export interface KpiItem {
  label: string
  value: number
  isPercent: boolean
}

const keyValueLine = /^(.+?):\s*([+-]?[\d,]+(?:\.\d+)?)(%)?\s*$/

function parseKeyValue(text: string): KpiItem | null {
  const match = keyValueLine.exec(text.trim())
  if (!match) return null
  const value = Number(match[2].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return { label: match[1].trim(), value, isPercent: match[3] === '%' }
}

/**
 * Finds a bullet/ordered list whose every item is a `Key: value` numeric line
 * (ELEMENTS.md "Numeric list / Key: value pairs" -> default widget List,
 * switchable KPI stat tiles / Bar / Pie). A single non-numeric item disqualifies
 * the whole list — falls back to the plain List default render, per
 * "only alternatives valid for the actual data shape".
 */
export function extractKpiListItems(tokens: Token[]): KpiItem[] | undefined {
  const listOpenIndex = tokens.findIndex((token) => token.type === 'bullet_list_open' || token.type === 'ordered_list_open')
  if (listOpenIndex === -1) return undefined

  const closeType = tokens[listOpenIndex]!.type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close'
  let listCloseIndex = tokens.findIndex((token, index) => index > listOpenIndex && token.type === closeType)
  if (listCloseIndex === -1) listCloseIndex = tokens.length - 1

  const items: KpiItem[] = []
  for (let i = listOpenIndex; i <= listCloseIndex; i++) {
    const token = tokens[i]!
    if (token.type !== 'inline') continue
    const parsed = parseKeyValue(token.content)
    if (!parsed) return undefined
    items.push(parsed)
  }
  return items.length > 0 ? items : undefined
}

/**
 * Finds a single `Key: value` paragraph that is the *only* inline content in
 * the card (ELEMENTS.md "Single large number / Metric: 42" -> default widget
 * Stat tile, switchable Gauge). Any list, table, or second paragraph
 * disqualifies this — those are `extractKpiListItems`'s / `extractTableData`'s
 * shapes instead, and this element is explicitly "single".
 */
export function extractSingleMetric(tokens: Token[]): KpiItem | undefined {
  const hasList = tokens.some((token) => token.type === 'bullet_list_open' || token.type === 'ordered_list_open')
  if (hasList) return undefined

  const inlineTokens = tokens.filter((token) => token.type === 'inline')
  if (inlineTokens.length !== 1) return undefined

  return parseKeyValue(inlineTokens[0]!.content) ?? undefined
}
