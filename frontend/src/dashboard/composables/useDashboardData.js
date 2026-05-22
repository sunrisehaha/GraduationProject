import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCarts } from '../../api/carts'
import { fetchDispatchExplanation } from '../../api/dispatch'
import {
  createFiveDemoOrders,
  createOneDemoOrder,
  fetchDemoState,
  resetDemoScene,
  setDemoMode,
  setDemoSpeed,
} from '../../api/demo'
import { createOrder, fetchOrderDetail, fetchOrderEvents, fetchOrders } from '../../api/orders'
import {
  campusBusinessMap,
  findDeliveryTargetByText,
  getServicePointById,
} from '../../campus/campusBusinessMap'
import {
  formatPlace,
  formatPoint,
  formatTime,
  getSourceText,
  getStatusText,
} from './dashboardFormatters'
import {
  buildDestinationLabel,
  buildOrderView,
  buildTaskProgressSteps,
  getTaskProgressText,
  getTopBarStatusText,
  orderFilterOptions,
  pickCurrentOrder,
  pickDefaultSelectedOrder,
} from './dashboardOrders'

// 看板轮询间隔：让页面保持实时感，但不要快到影响演示体验。
const refreshIntervalMs = 1000
const minimumRefreshIntervalMs = 250
const historyListLimit = 60
const orderFetchLimit = 120

// 手动下单起点：第一版保留为可选的固定业务点，优先让用户直接从真实地点发单。
const manualOrderStartOrder = ['marker_express_pickup', 'hub_dispatch_loading', 'gate_north', 'gate_south']

const manualOrderStartOptions = campusBusinessMap.servicePoints
  .filter((point) => ['pickup', 'hub', 'gate'].includes(point.type))
  .map((point) => ({
    value: point.id,
    label: point.name,
    hint: point.role,
  }))
  .sort(
    (left, right) =>
      manualOrderStartOrder.indexOf(left.value) - manualOrderStartOrder.indexOf(right.value)
  )

// 地点建议：输入框用 datalist 给出常见楼栋和地址示例，先做简单可用版本。
const manualOrderPlaceSuggestions = Array.from(
  new Set(
    campusBusinessMap.deliveryTargets.flatMap((target) => [
      target.name,
      ...target.addressExamples.slice(0, 2),
    ])
  )
)

function formatCartName(cart) {
  const rawName = cart?.name || cart?.cart_name || ''
  const cartId = cart?.id ?? cart?.cart_id
  const cartNameMatch = /^Cart-(\d+)$/i.exec(rawName)

  if (cartNameMatch) {
    return `小车 ${cartNameMatch[1]}`
  }

  if (!rawName && cartId) {
    return `小车 ${cartId}`
  }

  return rawName
}

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
  const isLoading = ref(false)
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
      isLoading.value = true
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
    } finally {
      if (requestId === refreshRequestId) {
        isLoading.value = false
      }
    }
  }

  // 手动派单：成功后主动把新订单设成历史面板当前选中项。
  async function submitOrder(formData) {
    try {
      const startPoint = getServicePointById(formData.startPointId)
      if (!startPoint?.point) {
        return { ok: false, message: '起点地点无效，请重新选择。' }
      }

      const endTarget = findDeliveryTargetByText(formData.endPlaceText)
      if (!endTarget?.deliveryPoint) {
        return { ok: false, message: '未找到对应地点，请输入楼栋名或示例地址。' }
      }

      const startLabel = startPoint.name
      const endLabel = buildDestinationLabel(formData.endPlaceText, endTarget)
      const createdOrder = await createOrder({
        start_point: {
          x: startPoint.point.x,
          y: startPoint.point.y,
          label_text: startLabel,
        },
        end_point: {
          x: endTarget.deliveryPoint.x,
          y: endTarget.deliveryPoint.y,
          label_text: endLabel,
        },
      })

      selectedOrderId.value = createdOrder.id
      addLog(`手动订单创建成功：${startLabel} -> ${endLabel}。`)
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`手动订单创建失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  // 演示重置：清空订单和任务，把小车放回默认待命点。
  async function handleResetDemo() {
    try {
      demoState.value = await resetDemoScene()
      selectedOrderId.value = null
      selectedOrderDetail.value = null
      selectedOrderEvents.value = []
      addLog('演示场景已重置，自动仿真已暂停。')
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`演示重置失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  // 演示订单创建：复用同一套反馈和选中逻辑。
  async function handleCreateDemoOrders(createAction, successText) {
    try {
      const result = await createAction()
      demoState.value = result
      selectedOrderId.value = result.orders?.[0]?.id || null
      addLog(successText)
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`演示订单创建失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  function handleCreateOneDemoOrder() {
    return handleCreateDemoOrders(createOneDemoOrder, '已创建 1 单标准演示订单。')
  }

  function handleCreateFiveDemoOrders() {
    return handleCreateDemoOrders(createFiveDemoOrders, '已创建 5 单标准演示订单。')
  }

  // 恢复自动仿真：关闭演示模式，让后台继续按节奏生成订单。
  async function handleRestoreAutoSimulation() {
    try {
      demoState.value = await setDemoMode(false)
      addLog('已恢复自动仿真订单生成。')
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`恢复自动仿真失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  async function handleSetDemoSpeed(speed) {
    try {
      refreshRequestId += 1
      demoState.value = await setDemoSpeed(speed)
      addLog(`演示倍速已切换为 ${speed}x。`)
      scheduleNextRefresh()
      return { ok: true }
    } catch (error) {
      addLog(`演示倍速切换失败：${error.message}`)
      return { ok: false, message: error.message }
    }
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

  // 当前主任务：供地图和当前任务卡片使用。
  const currentOrder = computed(() => pickCurrentOrder(orders.value))

  // 当前任务对应的小车：如果当前任务已分配，就优先拿分配的小车。
  const currentCart = computed(() => {
    if (currentOrder.value?.assigned_cart_id) {
      return (
        carts.value.find((cart) => cart.id === currentOrder.value.assigned_cart_id) ||
        carts.value[0] ||
        null
      )
    }

    return carts.value[0] || null
  })

  // 当前小车展示对象：把坐标和状态翻译成更适合页面的文本。
  const currentCartView = computed(() => {
    if (!currentCart.value) {
      return null
    }

    return {
      ...currentCart.value,
      name: formatCartName(currentCart.value),
      position: formatPoint(currentCart.value),
      status: getStatusText(currentCart.value.status),
      batteryText: `${currentCart.value.battery_level ?? 100}%`,
    }
  })

  // 当前路径：地图只需要当前主任务路径。
  const currentPath = computed(() => {
    const order = currentOrder.value

    if (!order?.assigned_cart_id) {
      return order?.path || []
    }

    const cart = carts.value.find((item) => item.id === order.assigned_cart_id)

    if (!cart?.current_path?.length) {
      return order.path || []
    }

    // 地图只强调“从当前小车位置继续要走的路”，避免完整路径和小车当前位置错位。
    const currentIndex = Math.max(0, (cart.path_index || 0) - 1)
    return cart.current_path.slice(currentIndex)
  })

  // 顶部统计：整个页面都依赖这些总览数字。
  const stats = computed(() => {
    const totalOrders = orders.value.length
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'to_pickup', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length
    const idleCarts = carts.value.filter((cart) => cart.status === 'idle').length

    return [
      { label: '在线小车', value: String(carts.value.length), meta: `空闲 ${idleCarts} 台` },
      { label: '执行中订单', value: String(activeOrders), meta: '分配或配送中' },
      { label: '最近订单', value: String(totalOrders), meta: '当前拉取范围' },
      { label: '已完成订单', value: String(completedOrders), meta: '完成闭环' },
      { label: '当前路径节点', value: String(currentPath.value.length), meta: '主任务剩余路径' },
    ]
  })

  // 顶部状态区：给页面一个更统一的口吻。
  const topBar = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'to_pickup', 'delivering'].includes(order.status)
    ).length

    return {
      statusText: getTopBarStatusText(activeOrders),
    }
  })

  // 地图摘要：只保留顶部一句运行概况，减少地图区的重复信息。
  const mapInfo = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'to_pickup', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length

    return {
      summary: `当前园区共有 ${carts.value.length} 台小车在线，执行中订单 ${activeOrders} 个，已完成 ${completedOrders} 个。`,
    }
  })

  // 当前任务视图：地图左侧主区聚焦这个对象。
  const currentTask = computed(() => {
    const order = currentOrder.value
    const assignedCart = order?.assigned_cart_id
      ? carts.value.find((cart) => cart.id === order.assigned_cart_id) || null
      : null

    return {
      id: order ? `#${order.id}` : '暂无',
      orderNo: order?.order_no || '-',
      start: formatPlace(order?.start_point, order?.start_label),
      end: formatPlace(order?.end_point, order?.end_label),
      status: order ? getStatusText(order.status) : '无任务',
      cart: assignedCart ? formatCartName(assignedCart) : (order ? '待分配' : '-'),
      source: order ? getSourceText(order.source) : '-',
      pathNodes: order?.path?.length || 0,
      createdAt: order?.create_time || '-',
      progressText: getTaskProgressText(order),
      progressSteps: buildTaskProgressSteps(order),
    }
  })

  // 车队摘要：给小车卡片顶部数字条使用。
  const fleetSummary = computed(() => {
    const idleCount = carts.value.filter((cart) => cart.status === 'idle').length
    const activeCount = carts.value.filter((cart) => cart.status !== 'idle').length

    return {
      total: carts.value.length,
      idle: idleCount,
      active: activeCount,
    }
  })

  // 车队列表：转成更适合界面展示的结构，并把执行中的小车排前面。
  const fleet = computed(() =>
    carts.value
      .map((cart) => ({
        id: cart.id,
        name: formatCartName(cart),
        position: formatPoint(cart),
        status: getStatusText(cart.status),
        batteryText: `${cart.battery_level ?? 100}%`,
        orderId: cart.current_order_id,
        isActive: cart.status !== 'idle',
      }))
      .sort((left, right) => Number(right.isActive) - Number(left.isActive))
  )

  // 历史列表：先按筛选条件过滤，再映射成界面展示对象。
  const filteredOrders = computed(() => {
    const rawOrders =
      orderFilter.value === 'all'
        ? orders.value
        : orders.value.filter((order) => order.status === orderFilter.value)

    return rawOrders
      .slice()
      .reverse()
      .slice(0, historyListLimit)
      .map((order) => buildOrderView(order))
  })

  // 当前选中订单视图：历史详情面板依赖这个对象。
  const selectedOrderView = computed(() => {
    if (!selectedOrderDetail.value) {
      return null
    }

    return {
      ...buildOrderView(selectedOrderDetail.value),
      pathNodes: selectedOrderDetail.value.path?.length || 0,
      assignedCartText: selectedOrderDetail.value.assigned_cart_id
        ? `#${selectedOrderDetail.value.assigned_cart_id}`
        : '待分配',
      events: selectedOrderEvents.value,
    }
  })

  // 演示控制面板状态：把后端字段转成页面直接能展示的中文。
  const demoControl = computed(() => ({
    simulationText: demoState.value.simulation_paused ? '暂停' : '运行中',
    modeText: demoState.value.demo_mode_enabled ? '演示模式' : '自动仿真',
    demoOrderCount: demoState.value.current_demo_order_count || 0,
    activeOrderCount: demoState.value.active_orders || 0,
    isDemoMode: demoState.value.demo_mode_enabled,
    speed: demoState.value.speed_multiplier || 1,
  }))

  // 调度解释：把后端候选车比较结果转成页面可读文本。
  const dispatchExplanation = computed(() => {
    const explanation = dispatchExplanationState.value

    if (!explanation?.order_id) {
      return {
        hasExplanation: false,
        strategy: '电量与车队均衡综合评分',
        summary: '还没有调度决策。',
        scoreFormula: '',
        candidates: [],
      }
    }

    return {
      ...explanation,
      hasExplanation: true,
      orderText: `#${explanation.order_id} · ${formatPoint(explanation.start_point)} -> ${formatPoint(explanation.end_point)}`,
      selectedCartText: formatCartName({
        id: explanation.selected_cart_id,
        name: explanation.selected_cart_name,
      }) || '暂无',
      selectedPathText: explanation.selected_path_length
        ? `${explanation.selected_path_length} 个路径节点`
        : '-',
      scoreFormula: explanation.score_formula || '',
      candidates: (explanation.candidates || []).map((candidate) => ({
        ...candidate,
        cart_name: formatCartName(candidate),
        statusText: getStatusText(candidate.status),
        distanceText:
          candidate.distance_to_pickup === null || candidate.distance_to_pickup === undefined
            ? '-'
            : `${candidate.distance_to_pickup} 格`,
        batteryText:
          candidate.battery_level === null || candidate.battery_level === undefined
            ? '-'
            : `${candidate.battery_level}%`,
        estimatedBatteryText:
          candidate.estimated_battery_usage === null || candidate.estimated_battery_usage === undefined
            ? '-'
            : `${candidate.estimated_battery_usage}%`,
        recentTaskText:
          candidate.recent_task_count === null || candidate.recent_task_count === undefined
            ? '-'
            : `${candidate.recent_task_count} 单`,
        scoreText:
          candidate.score === null || candidate.score === undefined
            ? '-'
            : String(candidate.score),
      })),
    }
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
    refreshData,
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
