// 看板订单视图工具：集中处理订单筛选项、当前订单选择和订单展示对象。
import { formatPlace, getSourceText, getStatusText } from './dashboardFormatters'

export const orderFilterOptions = [
  { value: 'all', label: '全部订单' },
  { value: 'pending', label: '待调度' },
  { value: 'assigned', label: '已分配' },
  { value: 'delivering', label: '配送中' },
  { value: 'completed', label: '已完成' },
]

export function getTaskProgressText(order) {
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

export function buildTaskProgressSteps(order) {
  const steps = ['等待订单', '分配小车', '路径规划', '配送执行', '任务完成']
  const activeIndexMap = {
    pending: 1,
    assigned: 2,
    to_pickup: 2,
    delivering: 3,
    completed: 4,
  }
  const activeIndex = order ? activeIndexMap[order.status] ?? 1 : 0

  return steps.map((label, index) => ({
    label,
    state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'waiting',
  }))
}

export function getTopBarStatusText(activeOrderCount) {
  return activeOrderCount > 0 ? '系统正在自动配送' : '系统待命中'
}

export function buildOrderView(order) {
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

export function buildDestinationLabel(rawText, target) {
  const input = String(rawText || '').trim()

  if (!input) {
    return target.name
  }

  return /室|单元|门口|前台|大厅|值班|办公室/.test(input) ? input : target.name
}

const currentOrderStatuses = new Set(['pending', 'assigned', 'to_pickup', 'delivering'])

export function shouldKeepCurrentOrder(order) {
  return Boolean(order?.id !== undefined && currentOrderStatuses.has(order.status))
}

export function pickCurrentOrder(orderList, lockedOrderId = null) {
  if (lockedOrderId !== null && lockedOrderId !== undefined) {
    const lockedOrder = orderList.find((order) => String(order.id) === String(lockedOrderId))

    if (shouldKeepCurrentOrder(lockedOrder)) {
      return lockedOrder
    }
  }

  const latestOrders = orderList.slice().reverse()

  return (
    latestOrders.find((order) => order.status === 'delivering') ||
    latestOrders.find((order) => order.status === 'to_pickup') ||
    latestOrders.find((order) => order.status === 'assigned') ||
    latestOrders.find((order) => order.status === 'pending') ||
    null
  )
}

export function pickDefaultSelectedOrder(orderList) {
  return pickCurrentOrder(orderList) || orderList[orderList.length - 1] || null
}
