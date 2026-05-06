import { requestJson } from './request'

export async function fetchCarts() {
  return requestJson('/api/carts', {}, '获取小车数据失败')
}
