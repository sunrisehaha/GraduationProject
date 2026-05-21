<script setup>
// 看板页：只负责组织页面结构，真正的数据和交互都放在 composable 里。
import { computed, markRaw, ref, watch } from 'vue'
import { useDashboardData } from './composables/useDashboardData'
import DashboardModuleShell from './components/layout/DashboardModuleShell.vue'
import LayoutSettingsDrawer from './components/layout/LayoutSettingsDrawer.vue'
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
  refreshData,
  stats,
  handleCreateFiveDemoOrders,
  handleCreateOneDemoOrder,
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

const moduleVisibilityStorageKey = 'smart-park-dashboard-module-visibility-v1'
const isLayoutEditing = ref(false)
const isLayoutSettingsOpen = ref(false)

// 模块定义：地图优先，右侧只放高频控制，底部承接辅助信息。
const moduleDefinitions = [
  { id: 'currentTask', eyebrow: 'CURRENT TASK', title: '当前任务', defaultOpen: true, region: 'side' },
  { id: 'demoControl', eyebrow: 'DEMO CONTROL', title: '演示控制', defaultOpen: true, region: 'side' },
  { id: 'fleetStatus', eyebrow: 'FLEET', title: '小车状态', defaultOpen: true, region: 'bottom' },
  { id: 'systemLog', eyebrow: 'LOG', title: '事件日志', defaultOpen: true, region: 'bottom' },
  { id: 'dispatchExplanation', eyebrow: 'DISPATCH REASON', title: '调度解释', defaultOpen: true, region: 'bottom' },
  { id: 'orderHistory', eyebrow: 'HISTORY', title: '订单历史', defaultOpen: true, region: 'bottom' },
  { id: 'createOrder', eyebrow: 'ORDER', title: '新订单', defaultOpen: false, region: 'bottom' },
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
const defaultVisibleState = Object.fromEntries(moduleDefinitions.map((module) => [module.id, true]))
const moduleOpenState = ref({ ...defaultOpenState })
const moduleVisibleState = ref(readVisibleState())

function readVisibleState() {
  if (typeof window === 'undefined') {
    return { ...defaultVisibleState }
  }

  try {
    const savedState = JSON.parse(window.localStorage.getItem(moduleVisibilityStorageKey) || '{}')

    return Object.fromEntries(
      moduleDefinitions.map((module) => [
        module.id,
        typeof savedState[module.id] === 'boolean' ? savedState[module.id] : true,
      ])
    )
  } catch {
    return { ...defaultVisibleState }
  }
}

function persistVisibleState() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(moduleVisibilityStorageKey, JSON.stringify(moduleVisibleState.value))
  } catch {
    // 本地存储不可用时不影响驾驶舱本身运行。
  }
}

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
    createOrder: '手动派单',
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

function setModuleVisible(moduleId, isVisible) {
  if (!moduleViewMap.value[moduleId]) {
    return
  }

  moduleVisibleState.value = {
    ...moduleVisibleState.value,
    [moduleId]: Boolean(isVisible),
  }
}

function resetModuleLayout() {
  moduleVisibleState.value = { ...defaultVisibleState }
  moduleOpenState.value = { ...defaultOpenState }
}

function toggleLayoutEditing() {
  isLayoutEditing.value = !isLayoutEditing.value
  isLayoutSettingsOpen.value = isLayoutEditing.value
}

function closeLayoutEditor() {
  isLayoutEditing.value = false
  isLayoutSettingsOpen.value = false
}

function saveLayout() {
  persistVisibleState()
  closeLayoutEditor()
}

function getModulesByRegion(region) {
  return moduleDefinitions
    .filter((module) => module.region === region)
    .map((module) => moduleViewMap.value[module.id])
    .filter((module) => module && moduleVisibleState.value[module.id] !== false)
}

const sideModules = computed(() => getModulesByRegion('side'))
const bottomModules = computed(() => getModulesByRegion('bottom'))
const settingModules = computed(() => moduleDefinitions.map((module) => moduleViewMap.value[module.id]).filter(Boolean))

watch(moduleVisibleState, persistVisibleState, { deep: true })
</script>

<template>
  <div class="screen-shell" :class="{ 'screen-shell--layout-editing': isLayoutEditing }">
    <TopBar
      :is-layout-editing="isLayoutEditing"
      :status-text="topBar.statusText"
      :stats="stats"
      :last-updated-text="lastUpdatedText"
      @toggle-layout-editing="toggleLayoutEditing"
      @open-layout-settings="isLayoutSettingsOpen = true"
      @refresh="refreshData"
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
        />
      </section>

      <aside class="dashboard-side-stack">
        <DashboardModuleShell
          v-for="module in sideModules"
          :key="module.id"
          :module="module"
          :is-open="moduleOpenState[module.id]"
          :is-editing="isLayoutEditing"
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
        :is-editing="isLayoutEditing"
        :class="`dashboard-module--${module.id}`"
        @toggle="toggleModule"
      >
        <component :is="module.component" v-bind="module.props" />
      </DashboardModuleShell>
    </section>

    <LayoutSettingsDrawer
      :is-open="isLayoutSettingsOpen"
      :modules="settingModules"
      :visible-state="moduleVisibleState"
      @close="isLayoutSettingsOpen = false"
      @reset-layout="resetModuleLayout"
      @save-layout="saveLayout"
      @set-visible="setModuleVisible"
    />
  </div>
</template>
