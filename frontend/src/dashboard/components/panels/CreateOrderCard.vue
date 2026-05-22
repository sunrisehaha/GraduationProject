<script setup>
import { reactive, ref } from 'vue'

// 创建订单卡片：起终点都用标准地点选择，避免手填坐标和浏览器默认输入候选层不一致。
const props = defineProps({
  submitOrder: {
    type: Function,
    required: true,
  },
  startOptions: {
    type: Array,
    required: true,
  },
  destinationSuggestions: {
    type: Array,
    required: true,
  },
})

const defaultStartPointId =
  props.startOptions.find((item) => item.value === 'marker_express_pickup')?.value ||
  props.startOptions[0]?.value ||
  ''

const form = reactive({
  startPointId: defaultStartPointId,
  endPlaceText: '',
})
const submitting = ref(false)
const feedbackText = ref('')
const feedbackType = ref('info')

// 提交动作：把地点交给外层解析，成功后清空终点选择并回显结果。
async function handleSubmit() {
  feedbackText.value = ''
  submitting.value = true
  const result = await props.submitOrder({ ...form })
  submitting.value = false

  if (result?.ok) {
    form.endPlaceText = ''
    feedbackType.value = 'success'
    feedbackText.value = '订单已创建，后台会自动调度最近空闲小车。'
    return
  }

  feedbackType.value = 'error'
  feedbackText.value = result?.message || '创建订单失败，请检查地点输入。'
}
</script>

<template>
  <section class="panel-card create-order-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">手动派单</p>
        <h2>手动派单</h2>
      </div>
    </div>

    <form class="order-form order-form--compact" @submit.prevent="handleSubmit">
      <div class="form-grid form-grid--compact">
        <label>
          <span>起点</span>
          <select v-model="form.startPointId" required>
            <option v-for="item in startOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label>
          <span>终点</span>
          <select v-model="form.endPlaceText" required>
            <option value="" disabled>请选择终点</option>
            <option
              v-for="item in destinationSuggestions"
              :key="item"
              :value="item"
            >
              {{ item }}
            </option>
          </select>
        </label>
      </div>

      <p class="order-form__hint">选择楼栋或公共建筑，系统自动映射收件点。</p>

      <p
        v-if="feedbackText"
        class="order-form__feedback"
        :class="`order-form__feedback--${feedbackType}`"
      >
        {{ feedbackText }}
      </p>

      <button type="submit" :disabled="submitting">
        {{ submitting ? '提交中...' : '创建' }}
      </button>
    </form>
  </section>
</template>
