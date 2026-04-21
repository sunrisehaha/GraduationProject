import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCarts } from '../api/carts'
import { createOrder, fetchOrders } from '../api/orders'

const refreshIntervalMs = 1000

// 时间格式化：统一界面上的时间显示格式
function formatTime() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
  })
}

// 状态翻译：把后端状态转成界面可读文字
function getStatusText(status) {
  const statusMap = {
    idle: '空闲',
    pending: '待调度',
    assigned: '已分配',
    to_pickup: '前往取件点',
    delivering: '配送中',
    completed: '已完成',
  }

  return statusMap[status] || status || '未知'
}

// 坐标格式化：把点位对象转成页面上的坐标字符串
function formatPoint(point) {
  if (!point) {
    return '-'
  }

  return `(${point.x}, ${point.y})`
}

// 订单来源翻译：区分仿真订单和手动订单
function getSourceText(source) {
  return source === 'simulated' ? '仿真订单' : '手动订单'
}

// 任务阶段说明：给当前任务卡片一个更明确的流程提示
function getTaskProgressText(order) {
  if (!order) {
    return '后台调度系统已启动，等待新的配送请求。'
  }

  const progressMap = {
    pending: '订单已进入队列，系统正在查找最近的空闲小车。',
    assigned: '订单已分配完成，小车即将前往取件点。',
    to_pickup: '小车正在前往取件点，准备装载快递。',
    delivering: '小车已经取件，正在按规划路径执行配送。',
    completed: '订单配送已完成，等待系统分配下一条任务。',
  }

  return progressMap[order.status] || '当前任务状态已更新。'
}

// 顶部状态文案：根据是否有活动订单决定系统提示语
function getTopBarStatusText(activeOrderCount) {
  return activeOrderCount > 0 ? '后台自动配送中' : '后台待命中'
}

export function useDashboardData() {
  const carts = ref([])
  const orders = ref([])
  const logs = ref([
    {
      text: 'Vue 页面已经接入真实后端数据轮询。',
      time: formatTime(),
    },
  ])
  const lastUpdatedText = ref('等待数据加载')
  const errorMessage = ref('')
  const isLoading = ref(false)

  let timerId = null

  // 系统消息：记录最近的业务事件，避免连续插入完全重复的提示
  function addLog(text) {
    if (logs.value[0]?.text === text) {
      return
    }

    logs.value.unshift({
      text,
      time: formatTime(),
    })
    logs.value = logs.value.slice(0, 10)
  }

  function processOrderChanges(previousOrders, latestOrders) {
    const previousOrderMap = new Map(previousOrders.map((order) => [order.id, order]))

    latestOrders.forEach((order) => {
      const previousOrder = previousOrderMap.get(order.id)

      if (!previousOrder) {
        addLog(
          order.source === 'simulated'
            ? `仿真系统生成订单 #${order.id}。`
            : `收到手动创建订单 #${order.id}。`
        )
        return
      }

      if (previousOrder.status === order.status) {
        return
      }

      if (order.status === 'assigned') {
        addLog(`订单 #${order.id} 已分配给小车 #${order.assigned_cart_id}。`)
      } else if (order.status === 'delivering') {
        addLog(`订单 #${order.id} 开始配送。`)
      } else if (order.status === 'completed') {
        addLog(`订单 #${order.id} 已完成配送。`)
      }
    })
  }

  async function refreshData() {
    try {
      isLoading.value = true
      errorMessage.value = ''
      const previousOrders = orders.value.slice()
      const [latestCarts, latestOrders] = await Promise.all([fetchCarts(), fetchOrders()])

      processOrderChanges(previousOrders, latestOrders)
      carts.value = latestCarts
      orders.value = latestOrders
      lastUpdatedText.value = `最近刷新时间：${formatTime()}`
    } catch (error) {
      errorMessage.value = error.message
      addLog(`数据刷新失败：${error.message}`)
    } finally {
      isLoading.value = false
    }
  }

  async function submitOrder(formData) {
    try {
      await createOrder({
        start_point: {
          x: Number(formData.startX),
          y: Number(formData.startY),
        },
        end_point: {
          x: Number(formData.endX),
          y: Number(formData.endY),
        },
      })

      addLog('手动订单创建成功，后台将自动调度最近空闲小车。')
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`手动订单创建失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  const currentOrder = computed(() => {
    return (
      orders.value.find((order) => order.status === 'delivering') ||
      orders.value.find((order) => order.status === 'assigned') ||
      orders.value.find((order) => order.status === 'pending') ||
      null
    )
  })

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

  const currentPath = computed(() => currentOrder.value?.path || [])

  const stats = computed(() => {
    const totalOrders = orders.value.length
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length
    const idleCarts = carts.value.filter((cart) => cart.status === 'idle').length

    return [
      { label: '总订单数', value: String(totalOrders), meta: '当前系统中的所有订单' },
      { label: '执行中订单', value: String(activeOrders), meta: '已分配或配送中的订单' },
      { label: '已完成订单', value: String(completedOrders), meta: '已完成配送任务' },
      { label: '空闲小车', value: String(idleCarts), meta: '当前可接收新任务的小车数量' },
    ]
  })

  const topBar = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'delivering'].includes(order.status)
    ).length

    return {
      statusText: getTopBarStatusText(activeOrders),
      subtitle: 'Vue 监控页已接入后台自动调度、订单轮询和 2.5D 园区地图展示。',
    }
  })

  const mapInfo = computed(() => {
    const activeOrders = orders.value.filter((order) =>
      ['assigned', 'delivering'].includes(order.status)
    ).length
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length

    return {
      summary: `当前共有 ${carts.value.length} 台小车，执行中订单 ${activeOrders} 个，已完成 ${completedOrders} 个。`,
      tags: [
        '地图规模 20 x 12',
        `在线小车 ${carts.value.length} 台`,
        `执行路径 ${currentPath.value.length} 个节点`,
      ],
    }
  })

  const currentTask = computed(() => {
    const order = currentOrder.value
    const assignedCart = order?.assigned_cart_id
      ? carts.value.find((cart) => cart.id === order.assigned_cart_id) || null
      : null

    return {
      id: order ? `#${order.id}` : '暂无',
      start: formatPoint(order?.start_point),
      end: formatPoint(order?.end_point),
      status: order ? getStatusText(order.status) : '无任务',
      cart: assignedCart?.name || (order ? '待分配' : '-'),
      source: order ? getSourceText(order.source) : '-',
      pathNodes: order?.path?.length || 0,
      progressText: getTaskProgressText(order),
    }
  })

  const fleetSummary = computed(() => {
    const idleCount = carts.value.filter((cart) => cart.status === 'idle').length
    const activeCount = carts.value.filter((cart) => cart.status !== 'idle').length

    return {
      total: carts.value.length,
      idle: idleCount,
      active: activeCount,
    }
  })

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

  onMounted(async () => {
    await refreshData()
    timerId = window.setInterval(refreshData, refreshIntervalMs)
  })

  onBeforeUnmount(() => {
    if (timerId) {
      window.clearInterval(timerId)
    }
  })

  return {
    carts,
    currentCart,
    currentCartView,
    currentPath,
    currentTask,
    errorMessage,
    fleet,
    fleetSummary,
    isLoading,
    logs,
    mapInfo,
    orders,
    refreshData,
    stats,
    submitOrder,
    topBar,
    lastUpdatedText,
  }
}
