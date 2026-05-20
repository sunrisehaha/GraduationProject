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
        <h2>调度控制台</h2>
      </div>
    </div>

    <div class="demo-control-group">
      <h3 class="demo-control-group__title">当前调度状态</h3>
      <div class="demo-status-grid">
        <article class="demo-status-item">
          <span class="demo-status-item__label">当前模式</span>
          <strong>{{ demoControl.modeText }}</strong>
        </article>
        <article class="demo-status-item">
          <span class="demo-status-item__label">活动订单</span>
          <strong>{{ demoControl.activeOrderCount }} 单</strong>
        </article>
        <article class="demo-status-item">
          <span class="demo-status-item__label">在线小车</span>
          <strong>{{ onlineCartCount }} 台</strong>
        </article>
        <article class="demo-status-item">
          <span class="demo-status-item__label">系统状态</span>
          <strong>{{ systemStatusText }}</strong>
        </article>
      </div>
    </div>

    <div class="demo-control-group">
      <h3 class="demo-control-group__title">主要操作</h3>
      <div class="demo-control-actions demo-control-actions--primary">
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
      </div>
    </div>

    <div class="demo-control-group">
      <h3 class="demo-control-group__title">辅助操作</h3>
      <div class="demo-control-actions demo-control-actions--secondary">
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
          class="demo-button demo-button--ghost"
          :disabled="Boolean(runningAction)"
          @click="runAction('restore', restoreAutoSimulation, '已恢复自动仿真。')"
        >
          {{ runningAction === 'restore' ? '恢复中...' : '恢复自动仿真' }}
        </button>
      </div>
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
