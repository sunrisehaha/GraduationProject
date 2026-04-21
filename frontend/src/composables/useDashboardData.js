import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchCarts } from '../api/carts'
import { createOrder, fetchOrders } from '../api/orders'

const refreshIntervalMs = 1000

function formatTime() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
  })
}

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

function formatPoint(point) {
  if (!point) {
    return '-'
  }

  return `(${point.x}, ${point.y})`
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

  function addLog(text) {
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
      statusText: activeOrders > 0 ? '后台自动配送中' : '后台待命中',
      subtitle: 'Vue 前端已接入 Flask 实时数据，后续继续迁移地图渲染与业务交互',
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

  const currentTask = computed(() => ({
    id: currentOrder.value ? `#${currentOrder.value.id}` : '暂无',
    start: formatPoint(currentOrder.value?.start_point),
    end: formatPoint(currentOrder.value?.end_point),
    status: currentOrder.value ? getStatusText(currentOrder.value.status) : '无任务',
    cart:
      currentOrder.value?.assigned_cart_id
        ? `Cart-${currentOrder.value.assigned_cart_id}`
        : '待分配',
    source: currentOrder.value?.source === 'simulated' ? '仿真订单' : '手动订单',
  }))

  const fleet = computed(() =>
    carts.value.map((cart) => ({
      id: cart.id,
      name: cart.name,
      position: formatPoint(cart),
      status: getStatusText(cart.status),
      orderId: cart.current_order_id,
    }))
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
