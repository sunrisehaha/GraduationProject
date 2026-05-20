<script setup>
// 看板页：只负责组织页面结构，真正的数据和交互都放在 composable 里。
import { computed, markRaw } from 'vue'
import { useDashboardData } from './composables/useDashboardData'
import { useDashboardModuleLayout } from './composables/useDashboardModuleLayout'
import DashboardModuleShell from './components/layout/DashboardModuleShell.vue'
import TopBar from './components/layout/TopBar.vue'
import StatsBar from './components/layout/StatsBar.vue'
import ParkMap from './components/map/ParkMap.vue'
import CreateOrderCard from './components/panels/CreateOrderCard.vue'
import CurrentTaskCard from './components/panels/CurrentTaskCard.vue'
import DemoControlCard from './components/panels/DemoControlCard.vue'
import DispatchExplanationCard from './components/panels/DispatchExplanationCard.vue'
import FleetStatusCard from './components/panels/FleetStatusCard.vue'
import OrderHistoryCard from './components/panels/OrderHistoryCard.vue'
import SystemLogCard from './components/panels/SystemLogCard.vue'

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

const moduleStorageKey = 'smart-park-dashboard-modules-v2'
const moduleStorageVersion = 2
const desktopModuleBreakpoint = 1320
const moduleGapPx = 12

// 模块定义：只维护一个全局顺序，布局再根据高度自动分配到右侧或下方。
const moduleDefinitions = [
  { id: 'demoControl', eyebrow: 'DEMO CONTROL', title: '调度控制台', defaultOpen: true, estimateHeight: 344 },
  { id: 'currentTask', eyebrow: 'CURRENT TASK', title: '当前任务', defaultOpen: true, estimateHeight: 430 },
  { id: 'dispatchExplanation', eyebrow: 'DISPATCH REASON', title: '调度解释', defaultOpen: true, estimateHeight: 420 },
  { id: 'fleetStatus', eyebrow: 'FLEET', title: '车队状态', defaultOpen: true, estimateHeight: 520 },
  { id: 'systemLog', eyebrow: 'LOG', title: '系统日志', defaultOpen: true, estimateHeight: 360 },
  { id: 'orderHistory', eyebrow: 'HISTORY', title: '订单历史', defaultOpen: false, estimateHeight: 820 },
  { id: 'createOrder', eyebrow: 'ORDER', title: '创建订单', defaultOpen: false, estimateHeight: 380 },
]

const moduleComponentMap = {
  demoControl: markRaw(DemoControlCard),
  currentTask: markRaw(CurrentTaskCard),
  dispatchExplanation: markRaw(DispatchExplanationCard),
  fleetStatus: markRaw(FleetStatusCard),
  systemLog: markRaw(SystemLogCard),
  orderHistory: markRaw(OrderHistoryCard),
  createOrder: markRaw(CreateOrderCard),
}

const {
  allocatedModuleIds,
  draggingModuleId,
  handleModuleDragOver,
  handleModuleDragStart,
  handleModuleDrop,
  mapColumnRef,
  moduleOpenState,
  moveDraggingModuleToEnd,
  setModuleElement,
  toggleModule,
} = useDashboardModuleLayout({
  moduleDefinitions,
  storageKey: moduleStorageKey,
  storageVersion: moduleStorageVersion,
  desktopBreakpoint: desktopModuleBreakpoint,
  moduleGapPx,
})

function getModuleSummary(moduleId) {
  const summaryMap = {
    demoControl: `${demoControl.value.modeText} · ${demoControl.value.activeOrderCount} 单活动`,
    currentTask: `${currentTask.value.id} · ${currentTask.value.status}`,
    dispatchExplanation: dispatchExplanation.value.hasExplanation
      ? dispatchExplanation.value.selectedCartText
      : '暂无调度决策',
    fleetStatus: `${fleetSummary.value.total} 辆 · ${fleetSummary.value.active} 忙碌 · ${fleetSummary.value.idle} 空闲`,
    systemLog: `${logs.value.length} 条事件`,
    orderHistory: `${filteredOrders.value.length} 条记录`,
    createOrder: '手动输入地点时展开',
  }

  return summaryMap[moduleId] || ''
}

function getModuleProps(moduleId) {
  const propsMap = {
    demoControl: {
      demoControl: demoControl.value,
      systemStatusText: topBar.value.statusText,
      onlineCartCount: carts.value.length,
      resetDemo: handleResetDemo,
      createOneDemoOrder: handleCreateOneDemoOrder,
      createFiveDemoOrders: handleCreateFiveDemoOrders,
      restoreAutoSimulation: handleRestoreAutoSimulation,
    },
    currentTask: {
      task: currentTask.value,
    },
    dispatchExplanation: {
      explanation: dispatchExplanation.value,
    },
    fleetStatus: {
      fleet: fleet.value,
      fleetSummary: fleetSummary.value,
      currentCart: currentCartView.value,
    },
    systemLog: {
      logs: logs.value,
    },
    orderHistory: {
      orders: filteredOrders.value,
      selectedOrder: selectedOrderView.value,
      selectedOrderId: selectedOrderId.value,
      orderFilter: orderFilter.value,
      orderFilterOptions: orderFilterOptions,
      setOrderFilter,
      selectOrder,
    },
    createOrder: {
      submitOrder,
      startOptions: manualOrderStartOptions,
      destinationSuggestions: manualOrderPlaceSuggestions,
    },
  }

  return propsMap[moduleId] || {}
}

const moduleViewMap = computed(() =>
  Object.fromEntries(
    moduleDefinitions.map((module) => [
      module.id,
      {
        ...module,
        component: moduleComponentMap[module.id],
        summary: getModuleSummary(module.id),
        props: getModuleProps(module.id),
      },
    ])
  )
)

const sideModules = computed(() =>
  allocatedModuleIds.value.side.map((moduleId) => moduleViewMap.value[moduleId]).filter(Boolean)
)
const overflowModules = computed(() =>
  allocatedModuleIds.value.overflow.map((moduleId) => moduleViewMap.value[moduleId]).filter(Boolean)
)
</script>

<template>
  <div class="screen-shell">
    <TopBar />
    <StatsBar
      :stats="stats"
      :status-text="topBar.statusText"
      :last-updated-text="lastUpdatedText"
    />

    <main class="dashboard-layout">
      <section ref="mapColumnRef" class="dashboard-main">
        <ParkMap
          :map-info="mapInfo"
          :current-task="currentTask"
          :current-path="currentPath"
          :carts="carts"
          :orders="orders"
        />
      </section>

      <aside
        class="dashboard-module-column dashboard-module-column--side"
        @dragover.prevent
        @drop.prevent="moveDraggingModuleToEnd"
      >
        <div
          v-for="module in sideModules"
          :key="module.id"
          :ref="(element) => setModuleElement(module.id, element)"
          class="dashboard-module-measure"
          :class="`dashboard-module-measure--${module.id}`"
        >
          <DashboardModuleShell
            :module="module"
            :is-open="moduleOpenState[module.id]"
            :is-dragging="draggingModuleId === module.id"
            @toggle="toggleModule"
            @drag-start="handleModuleDragStart"
            @drag-over="handleModuleDragOver"
            @drag-end="draggingModuleId = ''"
            @drop="handleModuleDrop"
          >
            <component :is="module.component" v-bind="module.props" />
          </DashboardModuleShell>
        </div>
        <p v-if="errorMessage" class="view-error">{{ errorMessage }}</p>
      </aside>
    </main>

    <section
      v-if="overflowModules.length"
      class="dashboard-module-overflow"
      @dragover.prevent
      @drop.prevent="moveDraggingModuleToEnd"
    >
      <div
        v-for="module in overflowModules"
        :key="module.id"
        :ref="(element) => setModuleElement(module.id, element)"
        class="dashboard-module-measure"
        :class="`dashboard-module-measure--${module.id}`"
      >
        <DashboardModuleShell
          :module="module"
          :is-open="moduleOpenState[module.id]"
          :is-dragging="draggingModuleId === module.id"
          @toggle="toggleModule"
          @drag-start="handleModuleDragStart"
          @drag-over="handleModuleDragOver"
          @drag-end="draggingModuleId = ''"
          @drop="handleModuleDrop"
        >
          <component :is="module.component" v-bind="module.props" />
        </DashboardModuleShell>
      </div>
    </section>
  </div>
</template>
