import { MODULE_BY_KEY } from '@/data/modules'
import { ledgerEntries, syncRestoredToLedger } from '@/data/ledger'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import {
  applySherdFilters,
  dedupeByCode,
  diagnoseEmpty,
  nextSherdCode,
  sortByPiecesDesc,
} from '@/data/sherd-rules'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult, SherdListResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
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
  // 复原确认批复驱动出土物台账：拼对记录一确认复原，台账同步入账。
  const ledgerNote = key === 'sherd' && target === '已复原' ? syncRestoredToLedger(updated) : ''
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」${ledgerNote}` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 陶片拼对列表：先按拼对编号去重（重复提交只留第一条），再按条件取交集，
// 需要时按拼合片数从多到少排序；命中为空时给出是哪个条件卡住的。
export function listSherdEntries(
  filters: Record<string, string> = {},
  sortPiecesDesc = false,
): SherdListResult {
  const { rows: all, dropped } = dedupeByCode(listRows('sherd'))
  const matched = applySherdFilters(all, filters)
  const items = sortPiecesDesc ? sortByPiecesDesc(matched) : matched
  const emptyHints = items.length === 0 ? diagnoseEmpty(all, filters) : []
  return { items, total: items.length, dropped, emptyHints }
}

// 按拼对编号取记录：多处入口共用同一份数据，重复编号只认第一条。
export function getSherdByCode(code: string): EntryRow | null {
  return listRows('sherd').find((row) => String(row['拼对编号']) === code) ?? null
}

// 登记拼对记录：编号留空时沿用既有编排顺延取号；编号重复时只保留第一条，不再入账。
export function createSherdEntry(fields: Record<string, string>): ActionResult {
  const meta = moduleMeta('sherd')
  const rows = listRows('sherd')
  const clean = (field: string) => (fields[field] ?? '').trim()
  const code = clean('拼对编号') || nextSherdCode(rows)
  if (rows.some((row) => String(row['拼对编号']) === code)) {
    return { ok: true, message: `拼对编号 ${code} 已存在，重复提交只保留第一条，本次未重复登记` }
  }
  if (clean('所属单位') === '') {
    return { ok: false, message: '所属单位不能为空' }
  }
  const pieces = clean('拼合片数')
  if (pieces !== '' && !/^\d+$/.test(pieces)) {
    return { ok: false, message: '拼合片数需填非负整数' }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const row: EntryRow = {
    id,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    拼对编号: code,
    所属单位: clean('所属单位'),
    陶系: clean('陶系'),
    纹饰: clean('纹饰'),
    可辨器型: clean('可辨器型'),
    拼合片数: pieces,
    拼对结论: clean('拼对结论'),
    拼对状态: meta.statuses[0],
  }
  saveRows('sherd', [...rows, row])
  return { ok: true, message: `已登记拼对记录 ${code}，当前状态「${meta.statuses[0]}」` }
}

// 出土物台账里由复原确认批复驱动的清单，陶系、纹饰以拼对原始记录为准。
export function listLedgerEntries(): EntryRow[] {
  return ledgerEntries()
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
