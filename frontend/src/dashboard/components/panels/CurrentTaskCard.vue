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
        <p class="panel-card__eyebrow">当前任务</p>
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

    <div class="current-task-route">
      <span>路线</span>
      <strong>{{ task.start }} → {{ task.end }}</strong>
    </div>

    <div class="current-task-meta-grid">
      <div class="current-task-meta-item">
        <span>小车</span>
        <strong>{{ task.cart }}</strong>
      </div>
      <div class="current-task-meta-item">
        <span>路径</span>
        <strong>{{ task.pathNodes }} 节点</strong>
      </div>
      <div class="current-task-meta-item">
        <span>来源</span>
        <strong>{{ task.source }}</strong>
      </div>
      <div class="current-task-meta-item">
        <span>创建</span>
        <strong>{{ task.createdAt }}</strong>
      </div>
    </div>
  </section>
</template>
