// 演示控制接口模块：统一封装答辩演示相关请求。
import { postAction, postJson, requestJson } from './request'

export function fetchDemoState() {
  return requestJson('/api/demo', {}, '演示控制请求失败')
}

export function setDemoMode(enabled) {
  return postJson('/api/demo/mode', { enabled }, '演示控制请求失败')
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
