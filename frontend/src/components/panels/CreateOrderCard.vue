<script setup>
import { reactive, ref } from 'vue'

const props = defineProps({
  submitOrder: {
    type: Function,
    required: true,
  },
})

const form = reactive({
  startX: '',
  startY: '',
  endX: '',
  endY: '',
})
const submitting = ref(false)

async function handleSubmit() {
  submitting.value = true
  const result = await props.submitOrder({ ...form })
  submitting.value = false

  if (result?.ok) {
    form.startX = ''
    form.startY = ''
    form.endX = ''
    form.endY = ''
  }
}
</script>

<template>
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">MANUAL ORDER</p>
        <h2>创建订单</h2>
      </div>
      <p class="panel-card__desc">这里已经接入真实后端接口，手动创建后会由后台自动调度最近空闲小车。</p>
    </div>

    <form class="order-form" @submit.prevent="handleSubmit">
      <div class="form-grid">
        <label>
          <span>起点 X</span>
          <input v-model="form.startX" type="number" min="0" max="19" placeholder="0-19" required />
        </label>
        <label>
          <span>起点 Y</span>
          <input v-model="form.startY" type="number" min="0" max="11" placeholder="0-11" required />
        </label>
        <label>
          <span>终点 X</span>
          <input v-model="form.endX" type="number" min="0" max="19" placeholder="0-19" required />
        </label>
        <label>
          <span>终点 Y</span>
          <input v-model="form.endY" type="number" min="0" max="11" placeholder="0-11" required />
        </label>
      </div>

      <button type="submit" :disabled="submitting">
        {{ submitting ? '提交中...' : '创建订单' }}
      </button>
    </form>
  </section>
</template>
