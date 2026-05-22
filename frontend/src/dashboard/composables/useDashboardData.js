import { onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCarts } from '../../api/carts'
import { fetchDispatchExplanation } from '../../api/dispatch'
import { fetchDemoState } from '../../api/demo'
import { fetchOrderDetail, fetchOrderEvents, fetchOrders } from '../../api/orders'
import { formatTime } from './dashboardFormatters'
import { orderFilterOptions, pickDefaultSelectedOrder } from './dashboardOrders'
import { createDashboardActions } from './dashboardActions'
import {
  createDashboardViewModels,
  manualOrderPlaceSuggestions,
  manualOrderStartOptions,
} from './dashboardViewModels'

// 看板轮询间隔：让页面保持实时感，但不要快到影响演示体验。
const refreshIntervalMs = 1000
const minimumRefreshIntervalMs = 250
const orderFetchLimit = 120

export function useDashboardData() {
  // 基础数据：后端轮询回来的原始小车和订单。
  const carts = ref([])
  const orders = ref([])
  const demoState = ref({
    demo_mode_enabled: false,
    simulation_paused: false,
    current_demo_order_ids: [],
    current_demo_order_count: 0,
    active_orders: 0,
    speed_multiplier: 1,
  })
  const dispatchExplanationState = ref(null)

  // 历史面板状态：当前筛选条件、选中的订单，以及它的详情和事件。
  const orderFilter = ref('all')
  const selectedOrderId = ref(null)
  const selectedOrderDetail = ref(null)
  const selectedOrderEvents = ref([])

  // 系统消息：保留最近几条关键事件，配合日志面板使用。
  const logs = ref([
    {
      text: '数据库版监控页已启动，页面会持续轮询真实订单与小车数据。',
      time: formatTime(),
    },
  ])

  const lastUpdatedText = ref('等待数据加载')
  const errorMessage = ref('')
  let timerId = null
  let isDashboardMounted = false
  let refreshRequestId = 0
  let refreshTimerVersion = 0

  function getDemoSpeedValue() {
    const speed = Number(demoState.value.speed_multiplier)

    if (!Number.isFinite(speed) || speed <= 0) {
      return 1
    }

    return speed
  }

  function getRefreshIntervalMs() {
    return Math.max(minimumRefreshIntervalMs, refreshIntervalMs / getDemoSpeedValue())
  }

  function clearRefreshTimer() {
    if (!timerId) {
      return
    }

    window.clearTimeout(timerId)
    timerId = null
    refreshTimerVersion += 1
  }

  function scheduleNextRefresh() {
    if (!isDashboardMounted) {
      return
    }

    clearRefreshTimer()
    const timerVersion = ++refreshTimerVersion
    timerId = window.setTimeout(async () => {
      timerId = null
      await refreshData()
      if (timerVersion === refreshTimerVersion) {
        scheduleNextRefresh()
      }
    }, getRefreshIntervalMs())
  }

  // 日志写入器：避免连续插入完全重复的消息。
  function addLog(text) {
    if (logs.value[0]?.text === text) {
      return
    }

    logs.value.unshift({
      text,
      time: formatTime(),
    })
    logs.value = logs.value.slice(0, 12)
  }

  // 订单变化分析：把状态变化翻译成更友好的系统提示。
  function processOrderChanges(previousOrders, latestOrders) {
    const previousOrderMap = new Map(previousOrders.map((order) => [order.id, order]))

    latestOrders.forEach((order) => {
      const previousOrder = previousOrderMap.get(order.id)

      if (!previousOrder) {
        addLog(
          order.source === 'simulated'
            ? `仿真系统生成订单 ${order.order_no || `#${order.id}`}。`
            : `收到手动创建订单 ${order.order_no || `#${order.id}`}。`
        )
        return
      }

      if (previousOrder.status === order.status) {
        return
      }

      if (order.status === 'assigned') {
        addLog(`订单 #${order.id} 已分配给小车 #${order.assigned_cart_id}。`)
      } else if (order.status === 'delivering') {
        addLog(`订单 #${order.id} 已进入配送中。`)
      } else if (order.status === 'completed') {
        addLog(`订单 #${order.id} 已完成配送。`)
      }
    })
  }

  // 详情加载器：历史面板只在这里读取订单详情和事件，方便后面继续扩展。
  async function loadSelectedOrderData(orderId) {
    if (!orderId) {
      selectedOrderDetail.value = null
      selectedOrderEvents.value = []
      return
    }

    const [detail, events] = await Promise.all([
      fetchOrderDetail(orderId),
      fetchOrderEvents(orderId),
    ])

    selectedOrderDetail.value = detail
    selectedOrderEvents.value = events
  }

  // 主刷新函数：轮询时统一更新总览数据、历史选中项和详情内容。
  async function refreshData() {
    const requestId = ++refreshRequestId

    try {
      errorMessage.value = ''

      const previousOrders = orders.value.slice()
      const [latestCarts, latestOrders, latestDemoState, latestDispatchExplanation] = await Promise.all([
        fetchCarts(),
        fetchOrders('all', orderFetchLimit),
        fetchDemoState(),
        fetchDispatchExplanation(),
      ])

      if (requestId !== refreshRequestId) {
        return
      }

      processOrderChanges(previousOrders, latestOrders)
      carts.value = latestCarts
      orders.value = latestOrders
      demoState.value = latestDemoState
      dispatchExplanationState.value = latestDispatchExplanation

      const selectedStillExists = latestOrders.some((order) => order.id === selectedOrderId.value)
      const fallbackOrder = pickDefaultSelectedOrder(latestOrders)
      const nextSelectedOrderId = selectedStillExists ? selectedOrderId.value : fallbackOrder?.id || null

      selectedOrderId.value = nextSelectedOrderId
      await loadSelectedOrderData(nextSelectedOrderId)

      lastUpdatedText.value = `最近刷新时间：${formatTime()}`
    } catch (error) {
      if (requestId !== refreshRequestId) {
        return
      }

      errorMessage.value = error.message
      addLog(`数据刷新失败：${error.message}`)
    }
  }

  function cancelActiveRefresh() {
    refreshRequestId += 1
  }

  // 历史筛选：只修改本地状态，订单列表本身仍用全量数据驱动。
  function setOrderFilter(nextFilter) {
    orderFilter.value = nextFilter
  }

  // 历史选中：点击历史订单后加载对应详情和事件。
  async function selectOrder(orderId) {
    selectedOrderId.value = orderId

    try {
      await loadSelectedOrderData(orderId)
    } catch (error) {
      errorMessage.value = error.message
      addLog(`订单详情加载失败：${error.message}`)
    }
  }

  const {
    handleCreateFiveDemoOrders,
    handleCreateOneDemoOrder,
    handleResetDemo,
    handleRestoreAutoSimulation,
    handleSetDemoSpeed,
    submitOrder,
  } = createDashboardActions({
    demoState,
    selectedOrderId,
    selectedOrderDetail,
    selectedOrderEvents,
    addLog,
    refreshData,
    cancelActiveRefresh,
    scheduleNextRefresh,
  })

  const {
    currentCartView,
    currentPath,
    currentTask,
    demoControl,
    dispatchExplanation,
    fleet,
    fleetSummary,
    filteredOrders,
    mapInfo,
    selectedOrderView,
    stats,
    topBar,
  } = createDashboardViewModels({
    carts,
    orders,
    demoState,
    dispatchExplanationState,
    orderFilter,
    selectedOrderDetail,
    selectedOrderEvents,
  })

  // 生命周期：组件挂载时立即拉一次数据，然后开始轮询。
  onMounted(async () => {
    isDashboardMounted = true
    await refreshData()
    scheduleNextRefresh()
  })

  // 生命周期：组件卸载时关闭轮询，避免留下多余定时器。
  onBeforeUnmount(() => {
    isDashboardMounted = false
    clearRefreshTimer()
  })

  return {
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
    orderFilter,
    orderFilterOptions,
    orders,
    selectOrder,
    selectedOrderId,
    selectedOrderView,
    setOrderFilter,
    stats,
    handleCreateFiveDemoOrders,
    handleCreateOneDemoOrder,
    handleResetDemo,
    handleRestoreAutoSimulation,
    handleSetDemoSpeed,
    submitOrder,
    topBar,
    lastUpdatedText,
  }
}
