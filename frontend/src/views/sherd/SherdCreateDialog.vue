<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <form class="modal" @submit.prevent="submit">
      <header class="modal-head">
        <h3>登记拼对记录</h3>
        <button class="link" type="button" @click="$emit('close')">关闭</button>
      </header>
      <div class="form-grid">
        <label class="form-item">
          <span>拼对编号</span>
          <input v-model="form.拼对编号" :placeholder="`留空按 SHER-#### 自动编排，现有 ${nextHint}`" />
        </label>
        <label class="form-item">
          <span>所属单位 *</span>
          <input v-model="form.所属单位" placeholder="如 H12、T0201③层" />
        </label>
        <label class="form-item">
          <span>陶系 *</span>
          <input v-model="form.陶系" placeholder="如 夹砂灰陶" list="sherd-ware-options" />
        </label>
        <label class="form-item">
          <span>纹饰 *</span>
          <input v-model="form.纹饰" placeholder="如 绳纹" list="sherd-pattern-options" />
        </label>
        <label class="form-item">
          <span>可辨器型</span>
          <input v-model="form.可辨器型" placeholder="如 鬲、罐、钵" />
        </label>
        <label class="form-item">
          <span>拼合片数 *</span>
          <input v-model.number="form.拼合片数" type="number" min="1" step="1" />
        </label>
        <label class="form-item form-wide">
          <span>拼对结论</span>
          <input v-model="form.拼对结论" placeholder="初步拼对意见，可留空" />
        </label>
      </div>
      <datalist id="sherd-ware-options">
        <option v-for="item in wareOptions" :key="item" :value="item" />
      </datalist>
      <datalist id="sherd-pattern-options">
        <option v-for="item in patternOptions" :key="item" :value="item" />
      </datalist>
      <p v-if="message" class="error-text">{{ message }}</p>
      <footer class="modal-foot">
        <button class="btn ghost" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="submit" :disabled="submitted">
          {{ submitted ? '已提交' : '提交登记' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

import { createSherdEntry } from '@/api/local-service'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', message: string): void
}>()

defineProps<{ nextHint: string; wareOptions: string[]; patternOptions: string[] }>()

const form = reactive({
  拼对编号: '',
  所属单位: '',
  陶系: '',
  纹饰: '',
  可辨器型: '',
  拼合片数: 1,
  拼对结论: '',
})
const message = ref('')
const submitted = ref(false)

function submit() {
  if (submitted.value) {
    return
  }
  submitted.value = true
  const result = createSherdEntry({ ...form })
  if (!result.ok) {
    submitted.value = false
    message.value = result.message
    return
  }
  emit('created', result.message)
}
</script>
