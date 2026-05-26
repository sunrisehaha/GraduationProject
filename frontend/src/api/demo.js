// 演示控制接口模块：统一封装答辩演示相关请求。
import { postAction, postJson, requestJson } from './request'

export function fetchDemoState() {
  return requestJson('/api/demo', {}, '演示控制请求失败')
}

export function setDemoMode(enabled) {
  return postJson('/api/demo/mode', { enabled }, '演示控制请求失败')
}

export function setDemoSpeed(speed) {
  return postJson('/api/demo/speed', { speed }, '演示倍速设置失败')
}

export function resetDemoScene() {
  return postAction('/api/demo/reset', '演示控制请求失败')
}

export function createOneDemoOrder() {
  return postAction('/api/demo/order-one', '演示控制请求失败')
}

export function createFiveDemoOrders() {
  return postAction('/api/demo/order-five', '演示控制请求失败')
}

export function placeRouteObstacle(orderId = null, cartId = null) {
  return postJson(
    '/api/demo/obstacle-route',
    { order_id: orderId, cart_id: cartId },
    '投放临时障碍失败'
  )
}

export function clearRouteObstacle() {
  return postAction('/api/demo/obstacle-clear', '清除临时障碍失败')
}
