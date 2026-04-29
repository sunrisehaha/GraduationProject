// 订单接口模块：统一封装订单相关请求，页面层只调用这里暴露的方法。

export async function fetchOrders(status = 'all', limit = 120) {
  const queryParams = new URLSearchParams()

  if (status && status !== 'all') {
    queryParams.set('status', status)
  }

  if (limit) {
    queryParams.set('limit', String(limit))
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
  const response = await fetch(`/api/orders${query}`)

  if (!response.ok) {
    throw new Error('获取订单数据失败')
  }

  return response.json()
}

export async function createOrder(payload) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('创建订单失败')
  }

  return response.json()
}

export async function fetchOrderDetail(orderId) {
  const response = await fetch(`/api/orders/${orderId}`)

  if (!response.ok) {
    throw new Error('获取订单详情失败')
  }

  return response.json()
}

export async function fetchOrderEvents(orderId) {
  const response = await fetch(`/api/orders/${orderId}/events`)

  if (!response.ok) {
    throw new Error('获取订单事件失败')
  }

  return response.json()
}
