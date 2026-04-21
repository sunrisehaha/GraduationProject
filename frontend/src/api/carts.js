export async function fetchCarts() {
  const response = await fetch('/api/carts')

  if (!response.ok) {
    throw new Error('获取小车数据失败')
  }

  return response.json()
}
