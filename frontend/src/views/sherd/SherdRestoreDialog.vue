<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <form class="modal" @submit.prevent="submit">
      <header class="modal-head">
        <h3>复原确认批复 · {{ row['拼对编号'] }}</h3>
        <button class="link" type="button" @click="$emit('close')">关闭</button>
      </header>
      <p class="form-hint">
        批复通过后将驱动出土物台账新增清单。陶系、纹饰两处若与原始拼对记录不一致，台账以原始记录为准。
      </p>
      <div class="form-grid">
        <label class="form-item">
          <span>陶系（批复填写）</span>
          <input v-model="form.陶系" list="restore-ware-options" />
        </label>
        <label class="form-item">
          <span>纹饰（批复填写）</span>
          <input v-model="form.纹饰" list="restore-pattern-options" />
        </label>
      </div>
      <datalist id="restore-ware-options">
        <option v-for="item in wareOptions" :key="item" :value="item" />
      </datalist>
      <datalist id="restore-pattern-options">
        <option v-for="item in patternOptions" :key="item" :value="item" />
      </datalist>
      <p class="form-hint">
        原始记录：陶系「{{ row['陶系'] || '空' }}」、纹饰「{{ row['纹饰'] || '空' }}」
        <template v-if="hasConflict">
          ；当前批复与原始记录不一致，提交时将<span class="warn-text">以原始记录为准</span>。
        </template>
      </p>
      <p v-if="message" class="error-text">{{ message }}</p>
      <footer class="modal-foot">
        <button class="btn ghost" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="submit" :disabled="submitted">
          {{ submitted ? '已批复' : '批复通过' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { confirmRestoration } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const props = defineProps<{
  row: EntryRow
  wareOptions: string[]
  patternOptions: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'approved', message: string): void
}>()

const form = reactive({
  陶系: String(props.row['陶系'] ?? ''),
  纹饰: String(props.row['纹饰'] ?? ''),
})
const message = ref('')
const submitted = ref(false)

const hasConflict = computed(
  () =>
    form.陶系.trim() !== String(props.row['陶系'] ?? '').trim() ||
    form.纹饰.trim() !== String(props.row['纹饰'] ?? '').trim(),
)

function submit() {
  if (submitted.value) {
    return
  }
  submitted.value = true
  const result = confirmRestoration(Number(props.row.id), { ...form })
  if (!result.ok) {
    submitted.value = false
    message.value = result.message
    return
  }
  emit('approved', result.message)
}
</script>
