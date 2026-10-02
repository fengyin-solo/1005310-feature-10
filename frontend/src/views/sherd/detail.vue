<template>
  <section class="page" data-module="sherd">
    <header class="page-head">
      <div>
        <h2>拼对记录 {{ code }}</h2>
        <p class="page-desc">拼对列表、出土物台账等入口共用同一份记录，这里看到的就是那一条。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="backTarget">退回原条件</RouterLink>
      </div>
    </header>

    <table v-if="record" class="data-table detail-table">
      <tbody>
        <tr v-for="field in fields" :key="field">
          <th>{{ field }}</th>
          <td>{{ record[field] ?? '—' }}</td>
        </tr>
        <tr>
          <th>当前状态</th>
          <td>{{ record.status }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">
      没有找到拼对编号为 {{ code }} 的拼对记录，可能尚未登记，或重复提交的记录已按编号去重。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { getSherdByCode, moduleMeta } from '@/api/local-service'

const route = useRoute()
const meta = moduleMeta('sherd')
const fields = meta.fields

const code = computed(() => String(route.params.code ?? ''))
const record = computed(() => getSherdByCode(code.value))

// 从哪个入口进来的就退回哪里去：列表进来的带着原检索条件回去。
const backTarget = computed(() => {
  if (route.query.from === 'find') {
    return { name: 'find' }
  }
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key !== 'from' && typeof value === 'string') {
      query[key] = value
    }
  }
  return { name: 'sherd', query }
})
</script>
