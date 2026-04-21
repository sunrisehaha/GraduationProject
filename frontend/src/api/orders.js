export async function fetchOrders() {
  const response = await fetch('/api/orders')

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
