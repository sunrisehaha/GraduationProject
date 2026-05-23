<script setup>
// 车队状态卡片：一次性展示全部小车，避免在模块里再套一层滚动。
const props = defineProps({
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
        <p class="panel-card__eyebrow">车队状态</p>
        <h2>车队状态</h2>
      </div>
    </div>

    <div class="fleet-summary-row">
      <span>总数 <strong>{{ fleetSummary.total }}</strong></span>
      <span>执行 <strong>{{ fleetSummary.active }}</strong></span>
      <span>空闲 <strong>{{ fleetSummary.idle }}</strong></span>
      <span>主车 <strong>{{ currentCart?.name || '暂无' }}</strong></span>
    </div>

    <ul class="fleet-card-list">
      <li v-for="cart in fleet" :key="cart.id" class="mini-list__item">
        <div class="mini-list__head">
          <p class="mini-list__title">{{ cart.name }}</p>
          <span class="info-row__value info-row__value--badge" :class="{ 'info-row__value--active': cart.isActive }">
            {{ cart.status }}
          </span>
        </div>
        <div class="cart-battery">
          <span :style="{ width: cart.batteryWidth, '--battery-color': cart.batteryColor }"></span>
        </div>
        <p class="mini-list__meta">{{ cart.batteryText }} · {{ cart.orderId ? `#${cart.orderId}` : '无任务' }} · {{ cart.position }}</p>
      </li>
    </ul>
  </section>
</template>
