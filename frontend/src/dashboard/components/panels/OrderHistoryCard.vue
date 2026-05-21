<script setup>
// 订单历史卡片：负责筛选订单、选中订单，以及展示订单详情和事件时间线。
defineProps({
  orders: {
    type: Array,
    required: true,
  },
  selectedOrder: {
    type: Object,
    default: null,
  },
  selectedOrderId: {
    type: Number,
    default: null,
  },
  orderFilter: {
    type: String,
    required: true,
  },
  orderFilterOptions: {
    type: Array,
    required: true,
  },
  setOrderFilter: {
    type: Function,
    required: true,
  },
  selectOrder: {
    type: Function,
    required: true,
  },
})
</script>

<template>
  <section class="panel-card history-panel">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">ORDER HISTORY</p>
        <h2>订单历史</h2>
      </div>
    </div>

    <div class="history-filter-row">
      <button
        v-for="item in orderFilterOptions"
        :key="item.value"
        type="button"
        class="history-filter-button"
        :class="{ 'history-filter-button--active': orderFilter === item.value }"
        @click="setOrderFilter(item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="history-body">
      <div class="history-list">
        <button
          v-for="order in orders"
          :key="order.id"
          type="button"
          class="history-item"
          :class="{ 'history-item--active': selectedOrderId === order.id }"
          @click="selectOrder(order.id)"
        >
          <div class="history-item__head">
            <p class="history-item__title">{{ order.displayOrderNo }}</p>
            <span class="history-item__badge">{{ order.statusText }}</span>
          </div>
          <p class="history-item__meta">{{ order.sourceText }} · {{ order.create_time || '-' }}</p>
          <p class="history-item__route">{{ order.startText }} → {{ order.endText }}</p>
        </button>

        <p v-if="!orders.length" class="empty-text">当前筛选条件下还没有订单。</p>
      </div>

      <div class="history-detail">
        <template v-if="selectedOrder">
          <div class="history-detail__hero">
            <h3>{{ selectedOrder.displayOrderNo }}</h3>
            <p class="history-detail__desc">{{ selectedOrder.statusText }} · {{ selectedOrder.sourceText }}</p>
          </div>

          <div class="info-stack info-stack--compact">
            <div class="info-row">
              <span class="info-row__label">编号</span>
              <span class="info-row__value">{{ selectedOrder.displayId }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">起点</span>
              <span class="info-row__value">{{ selectedOrder.startText }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">终点</span>
              <span class="info-row__value">{{ selectedOrder.endText }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">小车</span>
              <span class="info-row__value">{{ selectedOrder.assignedCartText }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">创建</span>
              <span class="info-row__value">{{ selectedOrder.create_time || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">完成</span>
              <span class="info-row__value">{{ selectedOrder.complete_time || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">路径</span>
              <span class="info-row__value">{{ selectedOrder.pathNodes }}</span>
            </div>
          </div>

          <div class="history-events">
            <article
              v-for="event in selectedOrder.events.slice(0, 5)"
              :key="event.id"
              class="history-event-item"
            >
              <div class="history-event-item__head">
                <span class="history-event-item__type">{{ event.event_type }}</span>
                <span class="history-event-item__time">{{ event.create_time || '-' }}</span>
              </div>
              <p class="history-event-item__desc">{{ event.event_desc }}</p>
              <p v-if="event.extra?.dispatch_summary" class="history-event-item__extra">
                {{ event.extra.dispatch_summary }}
              </p>
            </article>

            <p v-if="!selectedOrder.events.length" class="empty-text">该订单暂时还没有事件记录。</p>
          </div>
        </template>

        <p v-else class="empty-text">先从左侧挑一条订单，就能看到完整详情和事件流转。</p>
      </div>
    </div>
  </section>
</template>
