<script setup>
import { reactive, ref } from 'vue'

// 创建订单卡片：第一版改成“地点输入 -> 坐标映射”，不再让用户直接手填网格坐标。
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

// 提交动作：把地点交给外层解析，成功后清空终点输入并回显结果。
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
        <p class="panel-card__eyebrow">MANUAL ORDER</p>
        <h2>新订单</h2>
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
          <input
            v-model="form.endPlaceText"
            list="delivery-place-suggestions"
            type="text"
            placeholder="1栋101室 / 综合楼"
            required
          />
          <datalist id="delivery-place-suggestions">
            <option
              v-for="item in destinationSuggestions"
              :key="item"
              :value="item"
            />
          </datalist>
        </label>
      </div>

      <p class="order-form__hint">输入楼栋、房间号或公共建筑名，系统自动映射收件点。</p>

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
