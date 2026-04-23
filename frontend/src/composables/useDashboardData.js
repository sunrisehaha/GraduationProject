import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCarts } from '../api/carts'
import { createOrder, fetchOrderDetail, fetchOrderEvents, fetchOrders } from '../api/orders'

// 看板轮询间隔：让页面保持实时感，但不要快到影响演示体验。
const refreshIntervalMs = 1000
const historyListLimit = 60

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

// 订单来源翻译：区分手动订单和仿真订单。
function getSourceText(source) {
  return source === 'simulated' ? '仿真订单' : '手动订单'
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
    startText: formatPoint(order.start_point),
    endText: formatPoint(order.end_point),
    statusText: getStatusText(order.status),
    sourceText: getSourceText(order.source),
  }
}

// 当前主订单挑选规则：优先展示正在配送的订单，其次是已分配、待调度。
function pickCurrentOrder(orderList) {
  return (
    orderList.find((order) => order.status === 'delivering') ||
    orderList.find((order) => order.status === 'assigned') ||
    orderList.find((order) => order.status === 'pending') ||
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
      const [latestCarts, latestOrders] = await Promise.all([fetchCarts(), fetchOrders()])

      processOrderChanges(previousOrders, latestOrders)
      carts.value = latestCarts
      orders.value = latestOrders

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
      const createdOrder = await createOrder({
        start_point: {
          x: Number(formData.startX),
          y: Number(formData.startY),
        },
        end_point: {
          x: Number(formData.endX),
          y: Number(formData.endY),
        },
      })

      selectedOrderId.value = createdOrder.id
      addLog('手动订单创建成功，后台将自动调度最近空闲小车。')
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`手动订单创建失败：${error.message}`)
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
  const currentPath = computed(() => currentOrder.value?.path || [])

  // 顶部统计：整个页面都依赖这些总览数字。
  const stats = computed(() => {
    const totalOrders = orders.value.length
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length
    const idleCarts = carts.value.filter((cart) => cart.status === 'idle').length

    return [
      { label: '总订单数', value: String(totalOrders), meta: '数据库中累计写入的订单' },
      { label: '执行中订单', value: String(activeOrders), meta: '已分配或配送中的任务' },
      { label: '已完成订单', value: String(completedOrders), meta: '已经完成闭环的配送任务' },
      { label: '空闲小车', value: String(idleCarts), meta: '可立刻接单的小车数量' },
    ]
  })

  // 顶部状态区：给页面一个更统一的口吻。
  const topBar = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'delivering'].includes(order.status)
    ).length

    return {
      statusText: getTopBarStatusText(activeOrders),
      subtitle: '订单、车队、事件记录已经接入 ORM 与数据库，让演示页既能看调度，也能回看历史。',
    }
  })

  // 地图摘要：给地图区顶部和标签区提供内容。
  const mapInfo = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length

    return {
      summary: `当前园区共有 ${carts.value.length} 台小车在线，执行中订单 ${activeOrders} 个，已完成 ${completedOrders} 个。`,
      tags: [
        '地图规模 20 x 12',
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
      start: formatPoint(order?.start_point),
      end: formatPoint(order?.end_point),
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
    errorMessage,
    fleet,
    fleetSummary,
    filteredOrders,
    logs,
    mapInfo,
    orderFilter,
    orderFilterOptions,
    orders,
    refreshData,
    selectOrder,
    selectedOrderId,
    selectedOrderView,
    setOrderFilter,
    stats,
    submitOrder,
    topBar,
    lastUpdatedText,
  }
}
