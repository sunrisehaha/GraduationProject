<script setup>
// 当前任务卡片：集中展示后台自动调度选中的订单信息
defineProps({
  task: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">CURRENT TASK</p>
        <h2>当前任务</h2>
      </div>
      <p class="panel-card__desc">这里展示当前正在被调度或执行的主任务。</p>
    </div>

    <div class="panel-note">
      <p class="panel-note__title">任务进度</p>
      <p class="panel-note__text">{{ task.progressText }}</p>
    </div>

    <div class="info-stack">
      <div class="info-row">
        <span class="info-row__label">订单编号</span>
        <span class="info-row__value">{{ task.id }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">起点</span>
        <span class="info-row__value">{{ task.start }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">终点</span>
        <span class="info-row__value">{{ task.end }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">订单状态</span>
        <span class="info-row__value info-row__value--badge">{{ task.status }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">执行小车</span>
        <span class="info-row__value">{{ task.cart }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">任务来源</span>
        <span class="info-row__value">{{ task.source }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">路径节点</span>
        <span class="info-row__value">{{ task.pathNodes }}</span>
      </div>
    </div>
  </section>
</template>
