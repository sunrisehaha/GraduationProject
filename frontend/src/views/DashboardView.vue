<script setup>
// 看板页：只负责组织页面结构，真正的数据和交互都放在 composable 里。
import { useDashboardData } from '../composables/useDashboardData'
import TopBar from '../components/layout/TopBar.vue'
import StatsBar from '../components/layout/StatsBar.vue'
import ParkMap from '../components/map/ParkMap.vue'
import CreateOrderCard from '../components/panels/CreateOrderCard.vue'
import CurrentTaskCard from '../components/panels/CurrentTaskCard.vue'
import FleetStatusCard from '../components/panels/FleetStatusCard.vue'
import OrderHistoryCard from '../components/panels/OrderHistoryCard.vue'
import SystemLogCard from '../components/panels/SystemLogCard.vue'

const {
  carts,
  currentCartView,
  currentPath,
  currentTask,
  errorMessage,
  fleet,
  fleetSummary,
  filteredOrders,
  logs,
  mapInfo,
  orders,
  orderFilter,
  orderFilterOptions,
  stats,
  selectOrder,
  selectedOrderId,
  selectedOrderView,
  setOrderFilter,
  submitOrder,
  topBar,
  lastUpdatedText,
} = useDashboardData()
</script>

<template>
  <div class="screen-shell">
    <TopBar
      :status-text="topBar.statusText"
      :subtitle="topBar.subtitle"
      :last-updated-text="lastUpdatedText"
    />
    <StatsBar :stats="stats" />

    <main class="dashboard-layout">
      <section class="dashboard-main">
        <ParkMap
          :map-info="mapInfo"
          :current-task="currentTask"
          :current-path="currentPath"
          :carts="carts"
          :orders="orders"
        />

        <div class="dashboard-support-grid">
          <CurrentTaskCard :task="currentTask" />
          <FleetStatusCard :fleet="fleet" :fleet-summary="fleetSummary" :current-cart="currentCartView" />
        </div>
      </section>

      <aside class="dashboard-side">
        <CreateOrderCard :submit-order="submitOrder" />
        <OrderHistoryCard
          :orders="filteredOrders"
          :selected-order="selectedOrderView"
          :selected-order-id="selectedOrderId"
          :order-filter="orderFilter"
          :order-filter-options="orderFilterOptions"
          :set-order-filter="setOrderFilter"
          :select-order="selectOrder"
        />
        <SystemLogCard :logs="logs" />
        <p v-if="errorMessage" class="view-error">{{ errorMessage }}</p>
      </aside>
    </main>
  </div>
</template>
