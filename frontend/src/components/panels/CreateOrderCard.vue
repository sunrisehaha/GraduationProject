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
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">MANUAL ORDER</p>
        <h2>创建订单</h2>
      </div>
      <p class="panel-card__desc">直接输入楼栋或房间号，系统会自动映射到对应收件点并发起调度。</p>
    </div>

    <div class="panel-note">
      <p class="panel-note__title">第一版规则</p>
      <p class="panel-note__text">房间号先映射到楼下统一收件点，例如“1栋101室”会落到 1 栋收件点。</p>
    </div>

    <form class="order-form" @submit.prevent="handleSubmit">
      <div class="form-grid">
        <label>
          <span>起点地点</span>
          <select v-model="form.startPointId" required>
            <option v-for="item in startOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label>
          <span>终点地点</span>
          <input
            v-model="form.endPlaceText"
            list="delivery-place-suggestions"
            type="text"
            placeholder="例如：1栋101室、综合楼"
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

      <p class="panel-note__text">可直接输入楼栋名、房间号或公共楼名称，例如“5栋302室”“住户服务大楼”。</p>

      <p
        v-if="feedbackText"
        class="order-form__feedback"
        :class="`order-form__feedback--${feedbackType}`"
      >
        {{ feedbackText }}
      </p>

      <button type="submit" :disabled="submitting">
        {{ submitting ? '提交中...' : '创建订单' }}
      </button>
    </form>
  </section>
</template>
