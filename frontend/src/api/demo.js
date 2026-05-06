// 演示控制接口模块：统一封装答辩演示相关请求。

async function requestDemoAction(url, options = {}) {
  const response = await fetch(url, options)

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    throw new Error(errorPayload?.error || '演示控制请求失败')
  }

  return response.json()
}

export function fetchDemoState() {
  return requestDemoAction('/api/demo')
}

export function setDemoMode(enabled) {
  return requestDemoAction('/api/demo/mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  })
}

export function resetDemoScene() {
  return requestDemoAction('/api/demo/reset', {
    method: 'POST',
  })
}

export function createOneDemoOrder() {
  return requestDemoAction('/api/demo/order-one', {
    method: 'POST',
  })
}

export function createFiveDemoOrders() {
  return requestDemoAction('/api/demo/order-five', {
    method: 'POST',
  })
}
