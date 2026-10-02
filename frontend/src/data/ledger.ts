import { listRows, saveRows } from './local-store'
import type { EntryRow } from './types'

// 出土物台账与陶片拼对的联动：拼对记录「确认复原」批复后在这里入账，
// 台账与拼对记录两处填的陶系、纹饰不一致时，以拼对原始记录为准。

export const LEDGER_SOURCE_FIELD = '来源拼对编号'

const FIND_CODE_PATTERN = /^FIND-(\d+)$/

function nextFindCode(rows: EntryRow[]): string {
  const used = rows
    .map((row) => FIND_CODE_PATTERN.exec(String(row['器物编号'] ?? '')))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
  const next = used.length > 0 ? Math.max(...used) + 1 : 1
  return `FIND-${String(next).padStart(4, '0')}`
}

// 复原确认批复驱动台账：已入账的按原始记录更新（器物编号不换），未入账的新开一条。
// 返回追加在动作结果后面的说明文字。
export function syncRestoredToLedger(sherd: EntryRow): string {
  const code = String(sherd['拼对编号'] ?? '')
  if (code === '') {
    return ''
  }
  const rows = listRows('find')
  const mapped: Record<string, string> = {
    [LEDGER_SOURCE_FIELD]: code,
    出土探方: String(sherd['所属单位'] ?? ''),
    器物类别: String(sherd['可辨器型'] ?? ''),
    质地: String(sherd['陶系'] ?? ''),
    完残程度: `复原（拼合${String(sherd['拼合片数'] ?? '—')}片）`,
    登记状态: '复原入账',
    陶系: String(sherd['陶系'] ?? ''),
    纹饰: String(sherd['纹饰'] ?? ''),
  }
  const index = rows.findIndex((row) => String(row[LEDGER_SOURCE_FIELD] ?? '') === code)
  if (index >= 0) {
    const next = [...rows]
    next[index] = { ...rows[index], ...mapped }
    saveRows('find', next)
    return `，出土物台账已按原始记录更新（${String(next[index]['器物编号'])}）`
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const entry: EntryRow = {
    id,
    status: '已登记',
    pending: true,
    abnormal: false,
    器物编号: nextFindCode(rows),
    出土探方: '',
    出土层位: '',
    器物类别: '',
    质地: '',
    完残程度: '',
    最大尺寸: '',
    登记状态: '',
    ...mapped,
  }
  saveRows('find', [...rows, entry])
  return `，出土物台账已同步入账（${String(entry['器物编号'])}）`
}

// 台账清单里复原入账的部分：陶系、纹饰两处不一致时以拼对原始记录为准，
// 并标出「台账有出入」，让人知道展示值已经按原始记录校正过。
export function ledgerEntries(): EntryRow[] {
  const byCode = new Map<string, EntryRow>()
  for (const row of listRows('sherd')) {
    const code = String(row['拼对编号'] ?? '')
    if (code !== '' && !byCode.has(code)) {
      byCode.set(code, row)
    }
  }
  return listRows('find')
    .filter((row) => String(row[LEDGER_SOURCE_FIELD] ?? '') !== '')
    .map((row) => {
      const source = byCode.get(String(row[LEDGER_SOURCE_FIELD]))
      if (!source) {
        return { ...row, 台账有出入: false }
      }
      const 陶系 = String(source['陶系'] ?? '')
      const 纹饰 = String(source['纹饰'] ?? '')
      const 台账有出入 = 陶系 !== String(row['陶系'] ?? '') || 纹饰 !== String(row['纹饰'] ?? '')
      return { ...row, 陶系, 纹饰, 台账有出入 }
    })
}
