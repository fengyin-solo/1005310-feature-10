import type { EntryRow } from './types'

// 陶片拼对的检索规则：条件字段、交集过滤、片数排序、空命中诊断、编号编排。
// 全部是纯函数，页面和 local-service 只负责调用，不各自写一遍判断。

export const SHERD_FILTER_FIELDS = ['拼对编号', '陶系', '纹饰', '拼合片数'] as const

export const SHERD_CODE_PATTERN = /^SHER-(\d+)$/

function activeConditions(filters: Record<string, string>): [string, string][] {
  return SHERD_FILTER_FIELDS
    .map((field) => [field, (filters[field] ?? '').trim()] as [string, string])
    .filter(([, value]) => value !== '')
}

export function matchesCondition(row: EntryRow, field: string, value: string): boolean {
  const raw = String(row[field] ?? '').trim()
  const target = value.trim()
  if (field === '拼合片数') {
    // 片数按数值精确比对，避免「3」把「13」也带出来
    const rowNum = Number(raw)
    const targetNum = Number(target)
    if (raw !== '' && target !== '' && Number.isFinite(rowNum) && Number.isFinite(targetNum)) {
      return rowNum === targetNum
    }
    return raw === target
  }
  return raw.includes(target)
}

// 同一拼对编号重复提交时只保留第一条，后面的不再出现。
export function dedupeByCode(rows: EntryRow[]): { rows: EntryRow[]; dropped: number } {
  const seen = new Set<string>()
  const kept: EntryRow[] = []
  for (const row of rows) {
    const code = String(row['拼对编号'] ?? '')
    if (seen.has(code)) {
      continue
    }
    seen.add(code)
    kept.push(row)
  }
  return { rows: kept, dropped: rows.length - kept.length }
}

// 多个条件一起用时按交集给结果。
export function applySherdFilters(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const conditions = activeConditions(filters)
  if (conditions.length === 0) {
    return rows
  }
  return rows.filter((row) => conditions.every(([field, value]) => matchesCondition(row, field, value)))
}

function piecesOf(row: EntryRow): number {
  const raw = String(row['拼合片数'] ?? '').trim()
  const num = Number(raw)
  return raw !== '' && Number.isFinite(num) ? num : Number.NEGATIVE_INFINITY
}

// 按拼合片数从多到少排序；填不出数字的记录沉到最后。
export function sortByPiecesDesc(rows: EntryRow[]): EntryRow[] {
  return [...rows].sort((a, b) => piecesOf(b) - piecesOf(a))
}

// 命中为空时说明是哪个条件卡住的：单独就没有命中的条件直接点名；
// 各自都有命中但交集为空时，把每个条件单独的命中数列出来。
export function diagnoseEmpty(rows: EntryRow[], filters: Record<string, string>): string[] {
  const conditions = activeConditions(filters)
  if (conditions.length === 0) {
    return []
  }
  const counts = conditions.map(([field, value]) => ({
    field,
    value,
    count: rows.filter((row) => matchesCondition(row, field, value)).length,
  }))
  const blocked = counts.filter((item) => item.count === 0)
  if (blocked.length > 0) {
    const hints = blocked.map(
      (item) => `没有任何记录满足「${item.field}＝${item.value}」，命中为空是被这个条件卡住的`,
    )
    const rest = counts.filter((item) => item.count > 0)
    if (rest.length > 0) {
      hints.push(`其余条件单独都有命中：${rest.map((item) => `「${item.field}＝${item.value}」${item.count} 条`).join('，')}`)
    }
    return hints
  }
  return [
    `每个条件单独都有命中（${counts.map((item) => `「${item.field}＝${item.value}」${item.count} 条`).join('，')}），` +
      '但同时满足全部条件的记录不存在，可去掉部分条件再试',
  ]
}

// 新记录沿用既有编号编排（SHER-XXXX 顺延取号），老记录的编号一律不动。
export function nextSherdCode(rows: EntryRow[]): string {
  const used = rows
    .map((row) => SHERD_CODE_PATTERN.exec(String(row['拼对编号'] ?? '')))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
  const next = used.length > 0 ? Math.max(...used) + 1 : 1
  return `SHER-${String(next).padStart(4, '0')}`
}
