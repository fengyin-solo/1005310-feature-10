<template>
  <section class="page" data-module="sherd-detail">
    <header class="page-head">
      <div>
        <h2>拼对记录详情</h2>
        <p class="page-desc">
          各处入口按拼对编号共用这一份记录：{{ code }}。
          <RouterLink class="link" :to="backLink">退回原条件列表</RouterLink>
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="backLink">返回列表</RouterLink>
      </div>
    </header>

    <article v-if="row" class="detail-card">
      <dl class="detail-grid">
        <template v-for="field in meta.fields" :key="field">
          <dt>{{ field }}</dt>
          <dd>{{ row[field] === '' || row[field] == null ? '—' : row[field] }}</dd>
        </template>
        <dt>当前状态</dt>
        <dd>{{ row.status }}</dd>
      </dl>

      <div v-if="String(row.status) !== '已复原' && String(row.status) !== '已放弃'" class="detail-actions">
        <button
          v-for="action in availableActions"
          :key="action"
          class="btn"
          :class="{ primary: action === '确认复原' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </article>

    <div v-else class="empty-diagnosis" role="alert">
      <p>找不到拼对编号为「{{ code }}」的记录。</p>
      <p class="partial-hint">它可能已被重置，或编号填写有误。<RouterLink class="link" :to="backLink">返回列表核对</RouterLink></p>
    </div>

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
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

import SherdRestoreDialog from './SherdRestoreDialog.vue'

const meta = moduleMeta('sherd')
const availableActions = ['提交拼对', '确认复原', '终止拼对']
const route = useRoute()

const code = computed(() => (typeof route.query.code === 'string' ? route.query.code : ''))
const refreshTick = ref(0)
const rows = computed(() => {
  refreshTick.value
  return listRows(meta.key)
})
// 共用一份记录：重复编号时也只落到最早登记的那一条。
const row = computed(
  () => rows.value.find((item) => String(item['拼对编号']) === code.value) ?? null,
)
const errorMessage = ref('')
const restoreRow = ref<EntryRow | null>(null)

const wareOptions = computed(() =>
  [...new Set(rows.value.map((item) => String(item['陶系'] ?? '')).filter(Boolean))],
)
const patternOptions = computed(() =>
  [...new Set(rows.value.map((item) => String(item['纹饰'] ?? '')).filter(Boolean))],
)

const backLink = computed(() => {
  const query: Record<string, string> = {}
  for (const field of ['拼对编号', '陶系', '纹饰', '拼合片数']) {
    const value = route.query[`q_${field}`]
    if (typeof value === 'string' && value !== '') {
      query[`q_${field}`] = value
    }
  }
  if (route.query.sort === 'asc' || route.query.sort === 'desc') {
    query.sort = route.query.sort
  }
  return { path: '/sherd', query }
})

function runAction(action: string) {
  if (!row.value) {
    return
  }
  errorMessage.value = ''
  if (action === '确认复原') {
    restoreRow.value = row.value
    return
  }
  const result = applyAction(meta.key, Number(row.value.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
  }
  refreshTick.value += 1
}

function onApproved(message: string) {
  restoreRow.value = null
  errorMessage.value = message
  refreshTick.value += 1
}
</script>
