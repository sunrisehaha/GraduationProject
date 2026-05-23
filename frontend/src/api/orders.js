// 订单接口模块：统一封装订单相关请求，页面层只调用这里暴露的方法。
import { postJson, requestJson } from './request'

export async function fetchOrders(status = 'all', limit = null) {
  const queryParams = new URLSearchParams()

  if (status && status !== 'all') {
    queryParams.set('status', status)
  }

  if (limit) {
    queryParams.set('limit', String(limit))
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
  return requestJson(`/api/orders${query}`, {}, '获取订单数据失败')
}

export async function createOrder(payload) {
  return postJson('/api/orders', payload, '创建订单失败')
}

export async function fetchOrderDetail(orderId) {
  return requestJson(`/api/orders/${orderId}`, {}, '获取订单详情失败')
}

export async function fetchOrderEvents(orderId) {
  return requestJson(`/api/orders/${orderId}/events`, {}, '获取订单事件失败')
}

export async function fetchOrderEventFeed(limit = null) {
  const queryParams = new URLSearchParams()

  if (limit) {
    queryParams.set('limit', String(limit))
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
  return requestJson(`/api/order-events${query}`, {}, '获取事件日志失败')
}
