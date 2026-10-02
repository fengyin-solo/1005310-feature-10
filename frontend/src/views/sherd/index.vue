<template>
  <section class="page" data-module="sherd">
    <header class="page-head">
      <div>
        <h2>陶片拼对管理</h2>
        <p class="page-desc">围绕拼对编号、陶系、纹饰、拼合片数做交集检索；拼合片数可从多到少排序，拼对编号点进去是多个入口共用的那一条。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记拼对记录</button>
        <button class="btn" type="button" @click="exportRows">导出陶片拼对清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}${field === '拼合片数' ? '精确' : ''}检索`" />
      </label>
      <label class="filter-item">
        <span>拼合片数排序</span>
        <select v-model="sortDir">
          <option value="">不排序</option>
          <option value="desc">从多到少</option>
          <option value="asc">从少到多</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-if="total === 0 && hasActiveCondition" class="empty-diagnosis" role="alert">
      <p>没有命中的拼对记录。</p>
      <template v-if="blockedFields.length">
        <p>被以下条件卡住：</p>
        <ul>
          <li v-for="item in blockedFields" :key="item.field">
            <template v-if="item.field === '拼合片数' && item.invalid">
              「拼合片数」需填数字，当前「{{ item.value }}」无法按片数匹配
            </template>
            <template v-else>
              「{{ item.field }}」含「{{ item.value }}」：全部记录中 0 条匹配
            </template>
          </li>
        </ul>
      </template>
      <p v-else>每个条件单独看都有记录，但没有一条能同时满足，交集为空。各条件单独命中数：</p>
      <p v-if="partialFields.length" class="partial-hint">
        <template v-for="(item, index) in partialFields" :key="item.field">
          <template v-if="index > 0">；</template>
          「{{ item.field }}」含「{{ item.value }}」有 {{ item.matched }} 条
        </template>
      </p>
    </div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <RouterLink v-if="column === '拼对编号'" class="link" :to="detailLink(row)">
              {{ row[column] ?? '—' }}
            </RouterLink>
            <template v-else>{{ row[column] ?? '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length && !hasActiveCondition">
          <td :colspan="columns.length + 2" class="empty-state">暂无陶片拼对数据，可先登记拼对记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条陶片拼对记录（按拼对编号去重后的第一条）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <SherdCreateDialog
      v-if="showCreate"
      :next-hint="nextHint"
      :ware-options="wareOptions"
      :pattern-options="patternOptions"
      @close="showCreate = false"
      @created="onCreated"
    />
    <SherdRestoreDialog
      v-if="restoreRow"
      :row="restoreRow"
      :ware-options="wareOptions"
      :pattern-options="patternOptions"
      @close="restoreRow = null"
      @approved="onApproved"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  downloadEntries,
  moduleMeta,
  queryEntries,
  runAction as applyAction,
} from '@/api/local-service'
import { listRows } from '@/data/local-store'
import type { EntryRow, FilterDiagnosis } from '@/data/types'

import SherdCreateDialog from './SherdCreateDialog.vue'
import SherdRestoreDialog from './SherdRestoreDialog.vue'

const meta = moduleMeta('sherd')
const columns = ['拼对编号', '所属单位', '陶系', '纹饰', '可辨器型', '拼合片数', '拼对结论', '拼对状态']
const filterFields = ['拼对编号', '陶系', '纹饰', '拼合片数']
const actions = ['提交拼对', '确认复原', '终止拼对']
const statuses = ['待拼对', '拼对中', '已复原', '已放弃']
const stats = [
  { label: '待拼对记录', value: 0 },
  { label: '拼对中记录', value: 0 },
  { label: '已复原器物', value: 0 },
]

const route = useRoute()
const router = useRouter()

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const diagnoses = ref<FilterDiagnosis[]>([])
const filters = reactive<Record<string, string>>({
  拼对编号: '',
  陶系: '',
  纹饰: '',
  拼合片数: '',
})
const sortDir = ref<'' | 'asc' | 'desc'>('')
const showCreate = ref(false)
const restoreRow = ref<EntryRow | null>(null)

const allRowsView = computed(() => listRows(meta.key))
const wareOptions = computed(() =>
  [...new Set<string>(allRowsView.value.map((row: EntryRow) => String(row['陶系'] ?? '')).filter(Boolean))],
)
const patternOptions = computed(() =>
  [...new Set<string>(allRowsView.value.map((row: EntryRow) => String(row['纹饰'] ?? '')).filter(Boolean))],
)
const nextHint = computed(() => {
  const codes = allRowsView.value.map((row: EntryRow) => /(\d+)$/.exec(String(row['拼对编号'] ?? ''))?.[1] ?? '0')
  return `下一号 SHER-${String(Math.max(0, ...codes.map(Number)) + 1).padStart(4, '0')}`
})

const hasActiveCondition = computed(() =>
  Object.values(filters).some((value) => value.trim() !== ''),
)
const blockedFields = computed(() =>
  total.value === 0 && hasActiveCondition.value
    ? diagnoses.value.filter((item) => item.matched === 0)
    : [],
)
const partialFields = computed(() =>
  total.value === 0 && hasActiveCondition.value
    ? diagnoses.value.filter((item) => item.matched > 0)
    : [],
)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 从别处带着拼对编号点进来：落到那一条，同时保留退回原条件的上下文。
function detailLink(row: EntryRow) {
  const query: Record<string, string> = { code: String(row['拼对编号'] ?? '') }
  for (const field of filterFields) {
    if (filters[field].trim() !== '') {
      query[`q_${field}`] = filters[field].trim()
    }
  }
  if (sortDir.value) {
    query.sort = sortDir.value
  }
  return { path: '/sherd/detail', query }
}

function syncFiltersFromRoute() {
  for (const field of filterFields) {
    const value = route.query[`q_${field}`]
    filters[field] = typeof value === 'string' ? value : ''
  }
  const sort = route.query.sort
  sortDir.value = sort === 'asc' || sort === 'desc' ? sort : ''
}

function resetFilters() {
  for (const field of filterFields) {
    filters[field] = ''
  }
  sortDir.value = ''
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = ''
  showCreate.value = true
}

function onCreated(message: string) {
  showCreate.value = false
  errorMessage.value = message
  reload()
}

function onApproved(message: string) {
  restoreRow.value = null
  errorMessage.value = message
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  if (action === '确认复原') {
    restoreRow.value = row
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = queryEntries(
      meta.key,
      { ...filters },
      {
        numericFields: ['拼合片数'],
        uniqueField: '拼对编号',
        sortBy: sortDir.value ? '拼合片数' : undefined,
        sortDir: sortDir.value || undefined,
      },
    )
    rows.value = payload.items
    total.value = payload.total
    diagnoses.value = payload.diagnoses
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '陶片拼对列表读取失败'
  }
}

onMounted(() => {
  syncFiltersFromRoute()
  const code = route.query.code
  if (typeof code === 'string' && code.trim() !== '') {
    // 多处入口共用一份拼对记录：带着编号进来时直接跳到那一条的详情页，退回时条件还在。
    const target = listRows(meta.key).find((row) => String(row['拼对编号']) === code.trim())
    if (target) {
      const backQuery: Record<string, string> = {}
      for (const field of filterFields) {
        if (filters[field] !== '') {
          backQuery[`q_${field}`] = filters[field]
        }
      }
      if (sortDir.value) {
        backQuery.sort = sortDir.value
      }
      router.replace({
        path: '/sherd/detail',
        query: { code: code.trim(), ...backQuery },
      })
      return
    }
  }
  reload()
})
</script>
