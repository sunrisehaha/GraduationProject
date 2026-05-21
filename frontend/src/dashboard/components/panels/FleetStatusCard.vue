<script setup>
// 小车状态卡片：用紧凑列表展示车队状态，减少占用空间。
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
        <p class="panel-card__eyebrow">FLEET STATUS</p>
        <h2>小车状态</h2>
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
          <span :style="{ width: cart.batteryText }"></span>
        </div>
        <p class="mini-list__meta">{{ cart.batteryText }} · {{ cart.orderId ? `#${cart.orderId}` : '无任务' }} · {{ cart.position }}</p>
      </li>
    </ul>
  </section>
</template>
