// 看板展示对象：把后端原始数据整理成组件可以直接渲染的结构。
import { computed, ref, watch } from 'vue'
import { campusBusinessMap, getOrderPlaceLabel } from '../../campus/campusBusinessMap'
import {
  formatPlace,
  formatPoint,
  getSourceText,
  getStatusText,
} from './dashboardFormatters'
import {
  buildOrderView,
  buildTaskProgressSteps,
  getTaskProgressText,
  getTopBarStatusText,
  pickCurrentOrder,
  shouldKeepCurrentOrder,
} from './dashboardOrders'

const activeOrderStatuses = ['assigned', 'to_pickup', 'delivering']
const manualOrderStartOrder = ['marker_express_pickup', 'hub_dispatch_loading', 'gate_north', 'gate_south']

function getManualStartSortIndex(pointId) {
  const priorityIndex = manualOrderStartOrder.indexOf(pointId)
  return priorityIndex === -1 ? manualOrderStartOrder.length : priorityIndex
}

export const manualOrderStartOptions = campusBusinessMap.servicePoints
  .filter((point) => ['pickup', 'hub', 'gate', 'delivery'].includes(point.type))
  .map((point) => ({
    value: point.id,
    label: getOrderPlaceLabel(point.name),
    hint: point.role,
    sortIndex: getManualStartSortIndex(point.id),
  }))
  .sort(
    (left, right) =>
      left.sortIndex - right.sortIndex || left.label.localeCompare(right.label, 'zh-Hans-CN')
  )

export const manualOrderPlaceSuggestions = Array.from(
  new Set(campusBusinessMap.deliveryTargets.map((target) => target.name))
)

function normalizeBatteryLevel(value) {
  const batteryLevel = Number(value ?? 100)

  if (!Number.isFinite(batteryLevel)) {
    return 100
  }

  return Math.max(0, Math.min(100, batteryLevel))
}

function getBatteryColor(value) {
  const batteryLevel = normalizeBatteryLevel(value)
  const hue = Math.round(125 * Math.pow(batteryLevel / 100, 1.6))
  return `hsl(${hue} 76% 43%)`
}

function getBatteryText(value) {
  return `${Math.round(normalizeBatteryLevel(value))}%`
}

function getBatteryWidth(value) {
  return `${normalizeBatteryLevel(value).toFixed(2)}%`
}

export function formatCartName(cart) {
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

function getActiveOrderCount(orders) {
  return orders.filter((order) => activeOrderStatuses.includes(order.status)).length
}

function getCurrentCart(currentOrder, carts) {
  if (currentOrder?.assigned_cart_id) {
    return (
      carts.find((cart) => cart.id === currentOrder.assigned_cart_id) ||
      carts[0] ||
      null
    )
  }

  return carts[0] || null
}

function buildCurrentPath(order, carts) {
  if (!order?.assigned_cart_id) {
    return order?.path || []
  }

  const cart = carts.find((item) => item.id === order.assigned_cart_id)

  if (!cart?.current_path?.length) {
    return order.path || []
  }

  // 地图只强调“从当前小车位置继续要走的路”，避免完整路径和小车当前位置错位。
  const currentIndex = Math.max(0, (cart.path_index || 0) - 1)
  return cart.current_path.slice(currentIndex)
}

export function createDashboardViewModels({
  carts,
  orders,
  demoState,
  dispatchExplanationState,
  orderFilter,
  selectedOrderDetail,
  selectedOrderEvents,
}) {
  const lockedCurrentOrderId = ref(null)
  const currentOrder = computed(() => pickCurrentOrder(orders.value, lockedCurrentOrderId.value))

  // 当前任务需要稳定，不然每秒刷新时新订单会抢走地图路线焦点。
  watch(
    currentOrder,
    (order) => {
      lockedCurrentOrderId.value = shouldKeepCurrentOrder(order) ? order.id : null
    },
    { immediate: true }
  )

  const currentCart = computed(() => getCurrentCart(currentOrder.value, carts.value))

  const currentCartView = computed(() => {
    if (!currentCart.value) {
      return null
    }

    return {
      ...currentCart.value,
      name: formatCartName(currentCart.value),
      position: formatPoint(currentCart.value),
      status: getStatusText(currentCart.value.status),
      batteryText: getBatteryText(currentCart.value.battery_level),
    }
  })

  const currentPath = computed(() => buildCurrentPath(currentOrder.value, carts.value))

  const stats = computed(() => {
    const totalOrders = orders.value.length
    const activeOrders = getActiveOrderCount(orders.value)
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length

    return [
      { label: '在线小车', value: String(carts.value.length) },
      { label: '执行中订单', value: String(activeOrders) },
      { label: '最近订单', value: String(totalOrders) },
      { label: '已完成订单', value: String(completedOrders) },
    ]
  })

  const topBar = computed(() => ({
    statusText: getTopBarStatusText(getActiveOrderCount(orders.value)),
  }))

  const mapInfo = computed(() => {
    const activeOrders = getActiveOrderCount(orders.value)
    const completedOrders = orders.value.filter((order) => order.status === 'completed').length

    return {
      summary: `当前园区共有 ${carts.value.length} 台小车在线，执行中订单 ${activeOrders} 个，已完成 ${completedOrders} 个。`,
    }
  })

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
        name: formatCartName(cart),
        position: formatPoint(cart),
        status: getStatusText(cart.status),
        batteryText: getBatteryText(cart.battery_level),
        batteryWidth: getBatteryWidth(cart.battery_level),
        batteryColor: getBatteryColor(cart.battery_level),
        orderId: cart.current_order_id,
        isActive: cart.status !== 'idle',
      }))
      .sort((left, right) => left.id - right.id)
  )

  const filteredOrders = computed(() => {
    const rawOrders =
      orderFilter.value === 'all'
        ? orders.value
        : orders.value.filter((order) => order.status === orderFilter.value)

    return rawOrders
      .slice()
      .reverse()
      .map((order) => buildOrderView(order))
  })

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

  const demoControl = computed(() => ({
    simulationText: demoState.value.simulation_paused ? '暂停' : '运行中',
    modeText: demoState.value.demo_mode_enabled ? '演示模式' : '自动仿真',
    demoOrderCount: demoState.value.current_demo_order_count || 0,
    activeOrderCount: demoState.value.active_orders || 0,
    isDemoMode: demoState.value.demo_mode_enabled,
    speed: demoState.value.speed_multiplier || 1,
  }))

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

  return {
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
  }
}
