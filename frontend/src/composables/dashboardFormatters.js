// 看板格式化工具：只负责把后端原始值转成页面能直接展示的中文文本。

export function formatTime() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
  })
}

export function getStatusText(status) {
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

export function formatPoint(point) {
  if (!point) {
    return '-'
  }

  return `(${point.x}, ${point.y})`
}

export function formatPlace(point, label) {
  if (!point && !label) {
    return '-'
  }

  if (label && point) {
    return `${label} · ${formatPoint(point)}`
  }

  return label || formatPoint(point)
}

export function getSourceText(source) {
  if (source === 'simulated') {
    return '仿真订单'
  }

  if (source === 'demo') {
    return '演示订单'
  }

  return '手动订单'
}
