<script setup>
// 小车状态卡片：展示主小车状态和整个车队概况。
defineProps({
  fleet: {
    type: Array,
    required: true
  },
  fleetSummary: {
    type: Object,
    required: true
  },
  currentCart: {
    type: Object,
    default: null
  }
})
</script>

<template>
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">FLEET STATUS</p>
        <h2>小车状态</h2>
      </div>
      <p class="panel-card__desc">这里展示主监控小车以及当前全部车队的实时状态。</p>
    </div>

    <div class="summary-strip">
      <span class="summary-strip__item">总数 {{ fleetSummary.total }}</span>
      <span class="summary-strip__item">执行中 {{ fleetSummary.active }}</span>
      <span class="summary-strip__item">空闲 {{ fleetSummary.idle }}</span>
    </div>

    <div class="info-stack">
      <div class="info-row">
        <span class="info-row__label">主小车名称</span>
        <span class="info-row__value">{{ currentCart?.name || '暂无' }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">当前位置</span>
        <span class="info-row__value">{{ currentCart?.position || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">运行状态</span>
        <span class="info-row__value info-row__value--badge">{{ currentCart?.status || '未知' }}</span>
      </div>
    </div>

    <ul class="mini-list mini-list--scroll">
      <li v-for="cart in fleet" :key="cart.id" class="mini-list__item">
        <div class="mini-list__head">
          <p class="mini-list__title">{{ cart.name }}</p>
          <span class="info-row__value info-row__value--badge" :class="{ 'info-row__value--active': cart.isActive }">
            {{ cart.status }}
          </span>
        </div>
        <p class="mini-list__meta">坐标：{{ cart.position }}</p>
        <p class="mini-list__meta">任务：{{ cart.orderId ? `#${cart.orderId}` : '无' }}</p>
      </li>
    </ul>
  </section>
</template>
