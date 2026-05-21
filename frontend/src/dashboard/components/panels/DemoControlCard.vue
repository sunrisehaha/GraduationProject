<script setup>
import { ref } from 'vue'

// 演示控制卡片：答辩时用来重置场景和创建标准演示订单。
const props = defineProps({
  demoControl: {
    type: Object,
    required: true,
  },
  systemStatusText: {
    type: String,
    required: true,
  },
  onlineCartCount: {
    type: Number,
    required: true,
  },
  resetDemo: {
    type: Function,
    required: true,
  },
  createOneDemoOrder: {
    type: Function,
    required: true,
  },
  createFiveDemoOrders: {
    type: Function,
    required: true,
  },
  restoreAutoSimulation: {
    type: Function,
    required: true,
  },
  setDemoSpeed: {
    type: Function,
    required: true,
  },
})

const runningAction = ref('')
const feedbackText = ref('')
const feedbackType = ref('info')

async function runAction(actionName, action, successText) {
  feedbackText.value = ''
  runningAction.value = actionName
  const result = await action()
  runningAction.value = ''

  if (result?.ok) {
    feedbackType.value = 'success'
    feedbackText.value = successText
    return
  }

  feedbackType.value = 'error'
  feedbackText.value = result?.message || '演示控制执行失败。'
}

function runSpeedChange(speed) {
  return runAction(`speed-${speed}`, () => props.setDemoSpeed(speed), `演示倍速已切换为 ${speed}x。`)
}
</script>

<template>
  <section class="panel-card demo-control-card demo-control-card--dense">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">DEMO CONTROL</p>
        <h2>演示控制</h2>
      </div>
    </div>

    <div class="demo-status-strip">
      <span class="demo-status-pill">{{ demoControl.modeText }}</span>
      <span>{{ demoControl.activeOrderCount }} 单</span>
      <span>{{ onlineCartCount }} 车</span>
      <span>{{ systemStatusText }}</span>
    </div>

    <div class="demo-speed-row demo-speed-row--compact">
      <button
        v-for="speed in [0.5, 1, 2, 4]"
        :key="speed"
        type="button"
        class="demo-speed-button"
        :class="{ 'demo-speed-button--active': Number(demoControl.speed) === speed }"
        :disabled="Boolean(runningAction)"
        @click="runSpeedChange(speed)"
      >
        {{ runningAction === `speed-${speed}` ? '...' : `${speed}x` }}
      </button>
    </div>

    <div class="demo-control-actions demo-control-actions--quick">
      <button
        type="button"
        class="demo-button"
        :disabled="Boolean(runningAction)"
        @click="runAction('one', createOneDemoOrder, '已创建 1 单演示。')"
      >
        {{ runningAction === 'one' ? '...' : '1 单' }}
      </button>
      <button
        type="button"
        class="demo-button"
        :disabled="Boolean(runningAction)"
        @click="runAction('five', createFiveDemoOrders, '已创建 5 单演示。')"
      >
        {{ runningAction === 'five' ? '...' : '5 单' }}
      </button>
      <button
        type="button"
        class="demo-button demo-button--reset"
        :disabled="Boolean(runningAction)"
        @click="runAction('reset', resetDemo, '演示场景已重置。')"
      >
        {{ runningAction === 'reset' ? '...' : '重置' }}
      </button>
      <button
        type="button"
        class="demo-button demo-button--ghost"
        :disabled="Boolean(runningAction)"
        @click="runAction('restore', restoreAutoSimulation, '已恢复自动仿真。')"
      >
        {{ runningAction === 'restore' ? '...' : '自动' }}
      </button>
    </div>

    <p
      v-if="feedbackText"
      class="order-form__feedback"
      :class="`order-form__feedback--${feedbackType}`"
    >
      {{ feedbackText }}
    </p>
  </section>
</template>
