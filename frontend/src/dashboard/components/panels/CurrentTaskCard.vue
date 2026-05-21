<script setup>
// 当前任务卡片：聚焦“系统现在正在推进哪一单”，信息尽量短平快。
defineProps({
  task: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <section class="panel-card panel-card--compact current-task-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">CURRENT TASK</p>
        <h2>当前任务</h2>
      </div>
    </div>

    <div class="current-task-hero">
      <div>
        <strong>{{ task.id }}</strong>
        <span>{{ task.orderNo }}</span>
      </div>
      <span class="info-row__value info-row__value--badge">{{ task.status }}</span>
    </div>

    <p class="current-task-progress-text">{{ task.progressText }}</p>

    <ol class="task-progress task-progress--compact">
      <li
        v-for="(step, index) in task.progressSteps"
        :key="step.label"
        class="task-progress__item"
        :class="`task-progress__item--${step.state}`"
      >
        <span class="task-progress__index">{{ index + 1 }}</span>
        <span class="task-progress__label">{{ step.label }}</span>
      </li>
    </ol>

    <div class="info-stack info-stack--compact">
      <div class="info-row">
        <span class="info-row__label">起点</span>
        <span class="info-row__value">{{ task.start }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">终点</span>
        <span class="info-row__value">{{ task.end }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">小车</span>
        <span class="info-row__value">{{ task.cart }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">路径</span>
        <span class="info-row__value">{{ task.pathNodes }} 节点</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">来源</span>
        <span class="info-row__value">{{ task.source }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">创建</span>
        <span class="info-row__value">{{ task.createdAt }}</span>
      </div>
    </div>
  </section>
</template>
