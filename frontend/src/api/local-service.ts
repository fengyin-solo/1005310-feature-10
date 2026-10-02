import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  EntryRow,
  FilterDiagnosis,
  ModuleMeta,
  OverviewResult,
  PageResult,
  QueryResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

function cellMatches(row: EntryRow, field: string, keyword: string, numeric: boolean): boolean {
  const cell = row[field]
  if (numeric) {
    const target = Number(keyword)
    if (!Number.isFinite(target)) {
      return false
    }
    return Number(cell) === target
  }
  return String(cell ?? '').includes(keyword.trim())
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => cellMatches(row, field, value.trim(), false)),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

type QueryOptions = {
  numericFields?: string[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  // 按该字段去重（拼对编号）：历史上重复提交进来的记录只保留最早一条，列表里同一条不会出现两遍。
  uniqueField?: string
}

// 条件检索：多条件取交集；同时返回每个条件单独的命中数，命中为空时页面能指出是哪个条件卡住的。
export function queryEntries(
  key: string,
  filters: Record<string, string>,
  options: QueryOptions = {},
): QueryResult {
  const all = listRows(key)
  const numericFields = new Set(options.numericFields ?? [])
  const pairs = Object.entries(filters)
    .map(([field, value]) => [field, value.trim()] as const)
    .filter(([, value]) => value !== '')

  const diagnoses: FilterDiagnosis[] = pairs.map(([field, value]) => {
    const numeric = numericFields.has(field)
    const invalid = numeric && !Number.isFinite(Number(value))
    return {
      field,
      value,
      invalid,
      matched: all.filter((row) => cellMatches(row, field, value, numeric)).length,
    }
  })

  let items = all.filter((row) =>
    pairs.every(([field, value]) => cellMatches(row, field, value, numericFields.has(field))),
  )

  if (options.uniqueField) {
    const seen = new Set<string>()
    items = items.filter((row) => {
      const key = String(row[options.uniqueField as string] ?? '')
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  if (options.sortBy) {
    const factor = options.sortDir === 'asc' ? 1 : -1
    items = [...items].sort((a, b) => {
      const av = Number(a[options.sortBy as string])
      const bv = Number(b[options.sortBy as string])
      if (Number.isNaN(av) || Number.isNaN(bv)) {
        return String(a[options.sortBy as string] ?? '').localeCompare(
          String(b[options.sortBy as string] ?? ''),
          'zh-Hans-CN',
        ) * factor
      }
      return (av - bv) * factor
    })
  }

  return { items, total: items.length, page: 1, size: items.length, diagnoses }
}

export function getEntry(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === id)
}

// 编号沿用既有 SHER-#### 编排：只在现有最大序号后递增，老记录不换号，断号也保留。
function nextCode(rows: EntryRow[], field: string, prefix: string): string {
  let max = 0
  for (const row of rows) {
    const matched = /^(\d+)$/.exec(String(row[field] ?? '').replace(new RegExp(`^${prefix}-?`), ''))
    if (matched) {
      max = Math.max(max, Number(matched[1]))
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

export type SherdDraft = {
  拼对编号?: string
  所属单位: string
  陶系: string
  纹饰: string
  可辨器型: string
  拼合片数: number
  拼对结论?: string
}

// 登记拼对记录：同一拼对编号重复提交时只保留第一条，不让同一条记录出现两遍。
export function createSherdEntry(draft: SherdDraft): ActionResult {
  const rows = listRows('sherd')
  const code = draft.拼对编号?.trim() || nextCode(rows, '拼对编号', 'SHER')
  const existed = rows.some((row) => String(row['拼对编号']) === code)
  if (existed) {
    return { ok: false, message: `拼对编号 ${code} 已登记，已保留最早一条，未重复登记` }
  }
  if (!draft.所属单位.trim()) {
    return { ok: false, message: '所属单位为必填项' }
  }
  if (!Number.isFinite(draft.拼合片数) || draft.拼合片数 < 1) {
    return { ok: false, message: '拼合片数需为不小于 1 的整数' }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const row: EntryRow = {
    id,
    status: '待拼对',
    pending: true,
    abnormal: false,
    拼对编号: code,
    所属单位: draft.所属单位.trim(),
    陶系: draft.陶系.trim(),
    纹饰: draft.纹饰.trim(),
    可辨器型: draft.可辨器型.trim(),
    拼合片数: Math.round(draft.拼合片数),
    拼对结论: draft.拼对结论?.trim() ?? '',
    拼对状态: '待拼对',
  }
  saveRows('sherd', [...rows, row])
  return { ok: true, message: `拼对记录 ${code} 已登记，当前状态「待拼对」` }
}

export type RestorationApproval = {
  陶系: string
  纹饰: string
}

// 复原确认批复：驱动出土物台账新增清单；批复里陶系、纹饰与原始拼对记录不一致时，以原始记录为准。
export function confirmRestoration(
  id: number,
  approval: RestorationApproval,
): ActionResult & { ledgerCode?: string } {
  const sieveRows = listRows('sherd')
  const index = sieveRows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的拼对记录` }
  }
  const sieve = sieveRows[index]
  if (String(sieve.status) === '已复原') {
    return { ok: false, message: '该拼对记录已确认复原，不用重复批复' }
  }

  const originalWare = String(sieve['陶系'] ?? '').trim()
  const originalPattern = String(sieve['纹饰'] ?? '').trim()
  const conflicts: string[] = []
  if (approval.陶系.trim() !== originalWare) {
    conflicts.push(`陶系：批复填「${approval.陶系.trim() || '空'}」，原始记录为「${originalWare}」`)
  }
  if (approval.纹饰.trim() !== originalPattern) {
    conflicts.push(`纹饰：批复填「${approval.纹饰.trim() || '空'}」，原始记录为「${originalPattern}」`)
  }

  const updated: EntryRow = {
    ...sieve,
    status: '已复原',
    pending: false,
    abnormal: false,
    陶系: originalWare,
    纹饰: originalPattern,
    拼对状态: '已复原',
  }
  saveRows('sherd', [...sieveRows.slice(0, index), updated, ...sieveRows.slice(index + 1)])

  const findRows = listRows('find')
  const sourceCode = String(sieve['拼对编号'])
  // 批复可能被重复提交：台账同一拼对编号只保留一条清单。
  const existing = findRows.find((row) => String(row['来源拼对编号']) === sourceCode)
  if (existing) {
    return {
      ok: true,
      ledgerCode: String(existing['器物编号']),
      message:
        conflicts.length > 0
          ? `拼对记录已复原；出土物台账已存在 ${existing['器物编号']}。${conflicts.join('；')}，均以原始记录为准。`
          : `拼对记录已复原，出土物台账清单 ${existing['器物编号']} 已存在，未重复登记`,
    }
  }

  const ledgerCode = nextCode(findRows, '器物编号', 'FIND')
  const findId = findRows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const vessel = String(sieve['可辨器型'] ?? '').trim()
  const ledger: EntryRow = {
    id: findId,
    status: '已登记',
    pending: true,
    abnormal: false,
    器物编号: ledgerCode,
    出土探方: '',
    出土层位: String(sieve['所属单位'] ?? ''),
    器物类别: vessel ? `陶器·${vessel}` : '陶器（复原）',
    质地: '陶',
    陶系: originalWare,
    纹饰: originalPattern,
    完残程度: '已复原',
    最大尺寸: '',
    来源拼对编号: sourceCode,
    登记状态: '已登记（复原批复）',
  }
  saveRows('find', [...findRows, ledger])

  const notice =
    conflicts.length > 0
      ? `。批复填写与原始记录不一致（${conflicts.join('；')}），台账已以原始记录为准`
      : ''
  return {
    ok: true,
    ledgerCode,
    message: `拼对记录 ${sourceCode} 已复原，出土物台账新增清单 ${ledgerCode}${notice}`,
  }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
