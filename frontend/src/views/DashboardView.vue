<script setup>
// 看板页：只负责组织页面结构，真正的数据和交互都放在 composable 里。
import { useDashboardData } from '../composables/useDashboardData'
import CollapsibleSection from '../components/layout/CollapsibleSection.vue'
import TopBar from '../components/layout/TopBar.vue'
import StatsBar from '../components/layout/StatsBar.vue'
import ParkMap from '../components/map/ParkMap.vue'
import CreateOrderCard from '../components/panels/CreateOrderCard.vue'
import CurrentTaskCard from '../components/panels/CurrentTaskCard.vue'
import DemoControlCard from '../components/panels/DemoControlCard.vue'
import DispatchExplanationCard from '../components/panels/DispatchExplanationCard.vue'
import FleetStatusCard from '../components/panels/FleetStatusCard.vue'
import OrderHistoryCard from '../components/panels/OrderHistoryCard.vue'
import SystemLogCard from '../components/panels/SystemLogCard.vue'

const {
  carts,
  currentCartView,
  currentPath,
  currentTask,
  demoControl,
  dispatchExplanation,
  errorMessage,
  fleet,
  fleetSummary,
  filteredOrders,
  logs,
  mapInfo,
  manualOrderPlaceSuggestions,
  manualOrderStartOptions,
  orders,
  orderFilter,
  orderFilterOptions,
  stats,
  handleCreateFiveDemoOrders,
  handleCreateOneDemoOrder,
  handleResetDemo,
  handleRestoreAutoSimulation,
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
      </section>

      <aside class="dashboard-side">
        <DemoControlCard
          :demo-control="demoControl"
          :reset-demo="handleResetDemo"
          :create-one-demo-order="handleCreateOneDemoOrder"
          :create-five-demo-orders="handleCreateFiveDemoOrders"
          :restore-auto-simulation="handleRestoreAutoSimulation"
        />
        <CurrentTaskCard :task="currentTask" />
        <DispatchExplanationCard :explanation="dispatchExplanation" />

        <CollapsibleSection
          eyebrow="FLEET"
          title="车队状态"
          :summary="`${fleetSummary.total} 辆 · ${fleetSummary.active} 忙碌 · ${fleetSummary.idle} 空闲`"
        >
          <FleetStatusCard :fleet="fleet" :fleet-summary="fleetSummary" :current-cart="currentCartView" />
        </CollapsibleSection>

        <CollapsibleSection
          eyebrow="ORDER"
          title="创建订单"
          summary="手动输入地点时展开"
        >
          <CreateOrderCard
            :submit-order="submitOrder"
            :start-options="manualOrderStartOptions"
            :destination-suggestions="manualOrderPlaceSuggestions"
          />
        </CollapsibleSection>

        <CollapsibleSection
          eyebrow="HISTORY"
          title="订单历史"
          :summary="`${filteredOrders.length} 条记录`"
        >
          <OrderHistoryCard
            :orders="filteredOrders"
            :selected-order="selectedOrderView"
            :selected-order-id="selectedOrderId"
            :order-filter="orderFilter"
            :order-filter-options="orderFilterOptions"
            :set-order-filter="setOrderFilter"
            :select-order="selectOrder"
          />
        </CollapsibleSection>

        <CollapsibleSection
          eyebrow="LOG"
          title="系统日志"
          :summary="`${logs.length} 条事件`"
        >
          <SystemLogCard :logs="logs" />
        </CollapsibleSection>
        <p v-if="errorMessage" class="view-error">{{ errorMessage }}</p>
      </aside>
    </main>
  </div>
</template>
