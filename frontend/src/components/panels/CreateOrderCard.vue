<script setup>
import { reactive, ref } from 'vue'

// 创建订单卡片：负责提交手动订单并清空表单
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
