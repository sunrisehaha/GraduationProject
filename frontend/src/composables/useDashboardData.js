import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCarts } from '../api/carts'
import {
  createFiveDemoOrders,
  createOneDemoOrder,
  fetchDemoState,
  resetDemoScene,
  setDemoMode,
} from '../api/demo'
import { createOrder, fetchOrderDetail, fetchOrderEvents, fetchOrders } from '../api/orders'
import {
  campusBusinessMap,
  findDeliveryTargetByText,
  getServicePointById,
} from './campusBusinessMap'

// 看板轮询间隔：让页面保持实时感，但不要快到影响演示体验。
const refreshIntervalMs = 1000
const historyListLimit = 60
const orderFetchLimit = 120

// 历史筛选项：放在这里统一管理，组件只负责展示。
const orderFilterOptions = [
  { value: 'all', label: '全部订单' },
  { value: 'pending', label: '待调度' },
  { value: 'assigned', label: '已分配' },
  { value: 'delivering', label: '配送中' },
  { value: 'completed', label: '已完成' },
]

// 时间格式化：统一界面上的时间显示格式。
function formatTime() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
  })
}

// 状态翻译：把后端状态值转成页面可读的中文。
function getStatusText(status) {
  const statusMap = {
    idle: '空闲',
    pending: '待调度',
    assigned: '已分配',
    to_pickup: '前往取件点',
    delivering: '配送中',
    completed: '已完成',
    cancelled: '已取消',
  }

  return statusMap[status] || status || '未知'
}

// 点位格式化：把坐标对象转成页面上更直观的文本。
function formatPoint(point) {
  if (!point) {
    return '-'
  }

  return `(${point.x}, ${point.y})`
}

// 地点格式化：优先展示“1栋101室、综合楼”这类人类可读地点，同时保留坐标方便解释。
function formatPlace(point, label) {
  if (!point && !label) {
    return '-'
  }

  if (label && point) {
    return `${label} · ${formatPoint(point)}`
  }

  return label || formatPoint(point)
}

// 订单来源翻译：区分手动订单和仿真订单。
function getSourceText(source) {
  if (source === 'simulated') {
    return '仿真订单'
  }

  if (source === 'demo') {
    return '演示订单'
  }

  return '手动订单'
}

// 当前任务阶段说明：给当前任务卡片配一段更像人话的描述。
function getTaskProgressText(order) {
  if (!order) {
    return '后台调度系统已启动，等待新的配送请求。'
  }

  const progressMap = {
    pending: '订单已进入队列，系统正在寻找最近的空闲小车。',
    assigned: '订单已完成分配，小车正在准备前往取件点。',
    to_pickup: '小车正在靠近取件点，准备开始装载。',
    delivering: '小车已经取件，正在沿规划路径执行配送。',
    completed: '订单配送已完成，系统正在等待下一条任务。',
  }

  return progressMap[order.status] || '当前任务状态已更新。'
}

// 顶部状态文案：根据活动订单数量生成简洁的系统状态。
function getTopBarStatusText(activeOrderCount) {
  return activeOrderCount > 0 ? '系统正在自动配送' : '系统待命中'
}

// 订单摘要格式化：把原始订单对象加工成界面直接能用的版本。
function buildOrderView(order) {
  if (!order) {
    return null
  }

  return {
    ...order,
    displayId: `#${order.id}`,
    displayOrderNo: order.order_no || `ORD-${order.id}`,
    startText: formatPlace(order.start_point, order.start_label),
    endText: formatPlace(order.end_point, order.end_label),
    statusText: getStatusText(order.status),
    sourceText: getSourceText(order.source),
  }
}

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

function buildDestinationLabel(rawText, target) {
  const input = String(rawText || '').trim()

  if (!input) {
    return target.name
  }

  return /室|单元|门口|前台|大厅|值班|办公室/.test(input) ? input : target.name
}

// 当前主订单挑选规则：优先展示正在配送的订单，其次是已分配、待调度。
function pickCurrentOrder(orderList) {
  const latestOrders = orderList.slice().reverse()

  return (
    latestOrders.find((order) => order.status === 'delivering') ||
    latestOrders.find((order) => order.status === 'to_pickup') ||
    latestOrders.find((order) => order.status === 'assigned') ||
    latestOrders.find((order) => order.status === 'pending') ||
    null
  )
}

// 历史详情默认选中项：优先跟随当前主订单，没有时退回最新订单。
function pickDefaultSelectedOrder(orderList) {
  return pickCurrentOrder(orderList) || orderList[orderList.length - 1] || null
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
  })

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
    try {
      isLoading.value = true
      errorMessage.value = ''

      const previousOrders = orders.value.slice()
      const [latestCarts, latestOrders, latestDemoState] = await Promise.all([
        fetchCarts(),
        fetchOrders('all', orderFetchLimit),
        fetchDemoState(),
      ])

      processOrderChanges(previousOrders, latestOrders)
      carts.value = latestCarts
      orders.value = latestOrders
      demoState.value = latestDemoState

      const selectedStillExists = latestOrders.some((order) => order.id === selectedOrderId.value)
      const fallbackOrder = pickDefaultSelectedOrder(latestOrders)
      const nextSelectedOrderId = selectedStillExists ? selectedOrderId.value : fallbackOrder?.id || null

      selectedOrderId.value = nextSelectedOrderId
      await loadSelectedOrderData(nextSelectedOrderId)

      lastUpdatedText.value = `最近刷新时间：${formatTime()}`
    } catch (error) {
      errorMessage.value = error.message
      addLog(`数据刷新失败：${error.message}`)
    } finally {
      isLoading.value = false
    }
  }

  // 创建订单：成功后主动把新订单设成历史面板当前选中项。
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
      position: formatPoint(currentCart.value),
      status: getStatusText(currentCart.value.status),
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
      { label: '最近订单数', value: String(totalOrders), meta: '当前监控页最近拉取的订单' },
      { label: '执行中订单', value: String(activeOrders), meta: '已分配或配送中的任务' },
      { label: '已完成订单', value: String(completedOrders), meta: '已经完成闭环的配送任务' },
      { label: '空闲小车', value: String(idleCarts), meta: '可立刻接单的小车数量' },
    ]
  })

  // 顶部状态区：给页面一个更统一的口吻。
  const topBar = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'to_pickup', 'delivering'].includes(order.status)
    ).length

    return {
      statusText: getTopBarStatusText(activeOrders),
      subtitle: '订单、车队、事件记录已经接入 ORM 与数据库，让演示页既能看调度，也能回看历史。',
    }
  })

  // 地图摘要：给地图区顶部和标签区提供内容。
  const mapInfo = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'to_pickup', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length

    return {
      summary: `当前园区共有 ${carts.value.length} 台小车在线，执行中订单 ${activeOrders} 个，已完成 ${completedOrders} 个。`,
      tags: [
        `地图规模 ${campusBusinessMap.gridCols} x ${campusBusinessMap.gridRows}`,
        `建筑/禁行区 ${campusBusinessMap.zones.length} 处`,
        `业务点位 ${campusBusinessMap.servicePoints.length} 个`,
        `主路走廊 ${campusBusinessMap.roads.length} 条`,
        `在线小车 ${carts.value.length} 台`,
        `当前路径 ${currentPath.value.length} 个节点`,
      ],
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
      cart: assignedCart?.name || (order ? '待分配' : '-'),
      source: order ? getSourceText(order.source) : '-',
      pathNodes: order?.path?.length || 0,
      createdAt: order?.create_time || '-',
      progressText: getTaskProgressText(order),
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
        name: cart.name,
        position: formatPoint(cart),
        status: getStatusText(cart.status),
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
  }))

  // 生命周期：组件挂载时立即拉一次数据，然后开始轮询。
  onMounted(async () => {
    await refreshData()
    timerId = window.setInterval(refreshData, refreshIntervalMs)
  })

  // 生命周期：组件卸载时关闭轮询，避免留下多余定时器。
  onBeforeUnmount(() => {
    if (timerId) {
      window.clearInterval(timerId)
    }
  })

  return {
    carts,
    currentCartView,
    currentPath,
    currentTask,
    demoControl,
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
    submitOrder,
    topBar,
    lastUpdatedText,
  }
}
