<script setup>
import { ref } from 'vue'

// 演示控制卡片：答辩时用来重置场景和创建标准演示订单。
const props = defineProps({
  demoControl: {
    type: Object,
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
</script>

<template>
  <section class="panel-card demo-control-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">DEMO CONTROL</p>
        <h2>演示控制</h2>
      </div>
      <p class="panel-card__desc">答辩时先重置场景，再选择单订单流程或五订单调度演示。</p>
    </div>

    <div class="demo-status-grid">
      <div class="info-row">
        <span class="info-row__label">当前模式</span>
        <span class="info-row__value info-row__value--badge">{{ demoControl.modeText }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">自动仿真</span>
        <span class="info-row__value">{{ demoControl.simulationText }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">演示订单</span>
        <span class="info-row__value">{{ demoControl.demoOrderCount }} 单</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">活动订单</span>
        <span class="info-row__value">{{ demoControl.activeOrderCount }} 单</span>
      </div>
    </div>

    <div class="demo-control-actions">
      <button
        type="button"
        class="demo-button demo-button--secondary"
        :disabled="Boolean(runningAction)"
        @click="runAction('reset', resetDemo, '演示场景已重置。')"
      >
        {{ runningAction === 'reset' ? '重置中...' : '重置演示' }}
      </button>
      <button
        type="button"
        class="demo-button"
        :disabled="Boolean(runningAction)"
        @click="runAction('one', createOneDemoOrder, '已创建 1 单演示。')"
      >
        {{ runningAction === 'one' ? '创建中...' : '创建 1 单演示' }}
      </button>
      <button
        type="button"
        class="demo-button"
        :disabled="Boolean(runningAction)"
        @click="runAction('five', createFiveDemoOrders, '已创建 5 单演示。')"
      >
        {{ runningAction === 'five' ? '创建中...' : '创建 5 单演示' }}
      </button>
      <button
        type="button"
        class="demo-button demo-button--ghost"
        :disabled="Boolean(runningAction)"
        @click="runAction('restore', restoreAutoSimulation, '已恢复自动仿真。')"
      >
        {{ runningAction === 'restore' ? '恢复中...' : '恢复自动仿真' }}
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
