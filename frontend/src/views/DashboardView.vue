<script setup>
import { useDashboardData } from '../composables/useDashboardData'
import TopBar from '../components/layout/TopBar.vue'
import StatsBar from '../components/layout/StatsBar.vue'
import ParkMap from '../components/map/ParkMap.vue'
import CreateOrderCard from '../components/panels/CreateOrderCard.vue'
import CurrentTaskCard from '../components/panels/CurrentTaskCard.vue'
import FleetStatusCard from '../components/panels/FleetStatusCard.vue'
import SystemLogCard from '../components/panels/SystemLogCard.vue'

const {
  currentCartView,
  currentPath,
  currentTask,
  errorMessage,
  fleet,
  logs,
  mapInfo,
  stats,
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
      <ParkMap :map-info="mapInfo" :current-task="currentTask" :current-path="currentPath" />

      <aside class="sidebar">
        <CreateOrderCard :submit-order="submitOrder" />
        <CurrentTaskCard :task="currentTask" />
        <FleetStatusCard :fleet="fleet" :current-cart="currentCartView" />
        <SystemLogCard :logs="logs" />
        <p v-if="errorMessage" class="view-error">{{ errorMessage }}</p>
      </aside>
    </main>
  </div>
</template>
