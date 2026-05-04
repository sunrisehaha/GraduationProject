<script setup>
import { reactive, ref } from 'vue'

// 创建订单卡片：负责收集用户输入，并把坐标交给后端创建订单。
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

// 提交动作：把表单值交给外层方法，成功后把输入框清空。
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
      <p class="panel-card__desc">手动录入配送需求后，后台会自动查询最近空闲小车并开始调度。</p>
    </div>

    <div class="panel-note">
      <p class="panel-note__title">使用方式</p>
      <p class="panel-note__text">输入起点与终点坐标后提交订单，系统会自动规划和执行配送。</p>
    </div>

    <form class="order-form" @submit.prevent="handleSubmit">
      <div class="form-grid">
        <label>
          <span>起点 X</span>
          <input v-model="form.startX" type="number" min="0" max="39" placeholder="0-39" required />
        </label>
        <label>
          <span>起点 Y</span>
          <input v-model="form.startY" type="number" min="0" max="34" placeholder="0-34" required />
        </label>
        <label>
          <span>终点 X</span>
          <input v-model="form.endX" type="number" min="0" max="39" placeholder="0-39" required />
        </label>
        <label>
          <span>终点 Y</span>
          <input v-model="form.endY" type="number" min="0" max="34" placeholder="0-34" required />
        </label>
      </div>

      <button type="submit" :disabled="submitting">
        {{ submitting ? '提交中...' : '创建订单' }}
      </button>
    </form>
  </section>
</template>
