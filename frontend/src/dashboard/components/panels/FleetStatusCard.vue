<script setup>
import { computed, ref, watch } from 'vue'

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

const selectedCartId = ref(null)

const selectedCart = computed(() => {
  if (!props.fleet.length) {
    return null
  }

  return (
    props.fleet.find((cart) => cart.id === selectedCartId.value) ||
    props.fleet.find((cart) => cart.id === props.currentCart?.id) ||
    props.fleet[0]
  )
})

function selectCart(cartId) {
  selectedCartId.value = cartId
}

function getSensorBadgeText(cart) {
  return cart?.sensorStatus?.detected ? '告警' : '正常'
}

function getSensorDistanceText(cart) {
  const distance = cart?.sensorStatus?.distance_tiles
  return Number.isFinite(Number(distance)) ? `${distance} 格` : '-'
}

watch(
  () => [props.fleet.map((cart) => cart.id).join(','), props.currentCart?.id],
  () => {
    const selectedStillExists = props.fleet.some((cart) => cart.id === selectedCartId.value)
    if (selectedStillExists) {
      return
    }

    selectedCartId.value =
      props.fleet.find((cart) => cart.id === props.currentCart?.id)?.id ||
      props.fleet[0]?.id ||
      null
  },
  { immediate: true }
)
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
      <span>监控 <strong>{{ selectedCart?.name || '暂无' }}</strong></span>
    </div>

    <section
      v-if="selectedCart"
      class="fleet-device-panel"
      :class="{ 'fleet-device-panel--alert': selectedCart.sensorStatus?.detected }"
    >
      <div class="fleet-device-panel__head">
        <div>
          <span>设备监控</span>
          <strong>{{ selectedCart.name }}</strong>
        </div>
        <span class="fleet-device-panel__badge">{{ getSensorBadgeText(selectedCart) }}</span>
      </div>
      <div class="fleet-device-panel__grid">
        <span>传感器 <strong>{{ selectedCart.sensorStatus?.name || '前向障碍传感器' }}</strong></span>
        <span>状态 <strong>{{ selectedCart.sensorText }}</strong></span>
        <span>探测范围 <strong>{{ selectedCart.sensorStatus?.range_tiles || 6 }} 格</strong></span>
        <span>检测距离 <strong>{{ getSensorDistanceText(selectedCart) }}</strong></span>
        <span>任务 <strong>{{ selectedCart.orderId ? `#${selectedCart.orderId}` : '无任务' }}</strong></span>
        <span>位置 <strong>{{ selectedCart.position }}</strong></span>
      </div>
    </section>

    <ul class="fleet-card-list">
      <li
        v-for="cart in fleet"
        :key="cart.id"
        class="mini-list__item fleet-card-list__item"
        :class="{ 'fleet-card-list__item--selected': selectedCart?.id === cart.id }"
        role="button"
        tabindex="0"
        @click="selectCart(cart.id)"
        @keydown.enter.prevent="selectCart(cart.id)"
        @keydown.space.prevent="selectCart(cart.id)"
      >
        <div class="mini-list__head">
          <p class="mini-list__title">{{ cart.name }}</p>
          <span class="info-row__value info-row__value--badge" :class="{ 'info-row__value--active': cart.isActive }">
            {{ cart.status }}
          </span>
        </div>
        <div class="cart-battery">
          <span :style="{ width: cart.batteryWidth, '--battery-color': cart.batteryColor }"></span>
        </div>
        <p class="mini-list__meta">
          {{ cart.batteryText }} · {{ cart.orderId ? `#${cart.orderId}` : '无任务' }} · {{ cart.position }} · {{ cart.sensorText }}
        </p>
      </li>
    </ul>
  </section>
</template>
