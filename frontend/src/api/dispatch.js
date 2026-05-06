// 调度解释接口：读取后端最近一次调度决策。
import { requestJson } from './request'

export async function fetchDispatchExplanation() {
  return requestJson('/api/dispatch/explanation', {}, '获取调度解释失败')
}
