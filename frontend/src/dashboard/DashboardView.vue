<script setup>
// 看板页：只负责组织页面结构，真正的数据和交互都放在 composable 里。
import { computed, markRaw, ref } from 'vue'
import { useDashboardData } from './composables/useDashboardData'
import DashboardModuleShell from './components/layout/DashboardModuleShell.vue'
import TopBar from './components/layout/TopBar.vue'
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
  handleClearRouteObstacle,
  handleCreateFiveDemoOrders,
  handleCreateOneDemoOrder,
  handlePlaceRouteObstacle,
  handleResetDemo,
  handleRestoreAutoSimulation,
  handleSetDemoSpeed,
  selectOrder,
  selectedOrderId,
  selectedOrderView,
  setOrderFilter,
  submitOrder,
  topBar,
  lastUpdatedText,
} = useDashboardData()

// 模块定义：地图优先，右侧只放高频控制，底部承接辅助信息。
const moduleDefinitions = [
  { id: 'currentTask', title: '当前任务', icon: 'task', defaultOpen: true, region: 'side' },
  { id: 'demoControl', title: '演示控制', icon: 'control', defaultOpen: true, region: 'side' },
  { id: 'orderHistory', title: '订单详情', icon: 'history', defaultOpen: true, region: 'bottom' },
  { id: 'fleetStatus', title: '车队状态', icon: 'fleet', defaultOpen: true, region: 'bottom' },
  { id: 'createOrder', title: '手动派单', icon: 'order', defaultOpen: true, region: 'bottom' },
  { id: 'dispatchExplanation', title: '调度解释', icon: 'dispatch', defaultOpen: true, region: 'bottom' },
  { id: 'systemLog', title: '事件日志', icon: 'log', defaultOpen: true, region: 'bottom' },
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

const defaultOpenState = Object.fromEntries(moduleDefinitions.map((module) => [module.id, module.defaultOpen]))
const moduleOpenState = ref({ ...defaultOpenState })

function getModuleSummary(moduleId) {
  const summaryMap = {
    demoControl: `${demoControl.value.activeOrderCount} 单 · ${demoControl.value.speed}x`,
    currentTask: `${currentTask.value.status} · ${currentTask.value.cart}`,
    dispatchExplanation: dispatchExplanation.value.hasExplanation
      ? `选中 ${dispatchExplanation.value.selectedCartText}`
      : '暂无决策',
    fleetStatus: `${fleetSummary.value.active} 执行 · ${fleetSummary.value.idle} 空闲`,
    systemLog: `${logs.value.length} 条`,
    orderHistory: `${filteredOrders.value.length} 条订单`,
    createOrder: '',
  }

  return summaryMap[moduleId] || ''
}

function getModuleProps(moduleId) {
  const propsMap = {
    demoControl: {
      demoControl: demoControl.value,
      systemStatusText: topBar.value.statusText,
      onlineCartCount: carts.value.length,
      currentOrderId: currentTask.value.orderId || null,
      currentCartId: currentCartView.value?.id || null,
      resetDemo: handleResetDemo,
      createOneDemoOrder: handleCreateOneDemoOrder,
      createFiveDemoOrders: handleCreateFiveDemoOrders,
      placeRouteObstacle: handlePlaceRouteObstacle,
      clearRouteObstacle: handleClearRouteObstacle,
      restoreAutoSimulation: handleRestoreAutoSimulation,
      setDemoSpeed: handleSetDemoSpeed,
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

function toggleModule(moduleId) {
  moduleOpenState.value = {
    ...moduleOpenState.value,
    [moduleId]: !moduleOpenState.value[moduleId],
  }
}

function getModulesByRegion(region) {
  return moduleDefinitions
    .filter((module) => module.region === region)
    .map((module) => moduleViewMap.value[module.id])
    .filter(Boolean)
}

const sideModules = computed(() => getModulesByRegion('side'))
const bottomModules = computed(() => getModulesByRegion('bottom'))
</script>

<template>
  <div class="screen-shell">
    <TopBar
      :status-text="topBar.statusText"
      :stats="stats"
      :last-updated-text="lastUpdatedText"
    />

    <main class="dashboard-workspace">
      <section class="dashboard-map-stage">
        <ParkMap
          :map-info="mapInfo"
          :current-task="currentTask"
          :current-path="currentPath"
          :carts="carts"
          :orders="orders"
          :demo-speed="demoControl.speed"
          :dynamic-obstacles="demoControl.dynamicObstacles"
        />
      </section>

      <aside class="dashboard-side-stack">
        <DashboardModuleShell
          v-for="module in sideModules"
          :key="module.id"
          :module="module"
          :is-open="moduleOpenState[module.id]"
          :class="`dashboard-module--${module.id}`"
          @toggle="toggleModule"
        >
          <component :is="module.component" v-bind="module.props" />
        </DashboardModuleShell>
        <p v-if="errorMessage" class="view-error">{{ errorMessage }}</p>
      </aside>
    </main>

    <section class="dashboard-bottom-grid">
      <DashboardModuleShell
        v-for="module in bottomModules"
        :key="module.id"
        :module="module"
        :is-open="moduleOpenState[module.id]"
        :class="`dashboard-module--${module.id}`"
        @toggle="toggleModule"
      >
        <component :is="module.component" v-bind="module.props" />
      </DashboardModuleShell>
    </section>
  </div>
</template>
