// API 请求基础工具：统一处理 JSON 请求和错误信息，避免每个接口文件重复写 fetch 判断。

export async function requestJson(url, options = {}, fallbackErrorMessage = '请求失败') {
  const response = await fetch(url, options)

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    throw new Error(errorPayload?.error || fallbackErrorMessage)
  }

  return response.json()
}

export function postJson(url, payload, fallbackErrorMessage) {
  return requestJson(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    fallbackErrorMessage
  )
}

export function postAction(url, fallbackErrorMessage) {
  return requestJson(
    url,
    {
      method: 'POST',
    },
    fallbackErrorMessage
  )
}
