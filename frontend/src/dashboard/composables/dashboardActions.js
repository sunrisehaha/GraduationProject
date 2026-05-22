// 看板动作：集中处理会改变后端状态的按钮和表单操作。
import {
  createFiveDemoOrders,
  createOneDemoOrder,
  resetDemoScene,
  setDemoMode,
  setDemoSpeed,
} from '../../api/demo'
import { createOrder } from '../../api/orders'
import {
  findDeliveryTargetByText,
  getOrderPlaceLabel,
  getServicePointById,
} from '../../campus/campusBusinessMap'
import { buildDestinationLabel } from './dashboardOrders'

export function createDashboardActions({
  demoState,
  selectedOrderId,
  selectedOrderDetail,
  selectedOrderEvents,
  addLog,
  refreshData,
  cancelActiveRefresh,
  scheduleNextRefresh,
}) {
  async function submitOrder(formData) {
    try {
      const startPoint = getServicePointById(formData.startPointId)
      if (!startPoint?.point) {
        return { ok: false, message: '起点地点无效，请重新选择。' }
      }

      const endTarget = findDeliveryTargetByText(formData.endPlaceText)
      if (!endTarget?.deliveryPoint) {
        return { ok: false, message: '未找到对应地点，请输入楼栋名或示例地址。' }
      }

      const startLabel = getOrderPlaceLabel(startPoint.name)
      const endLabel = buildDestinationLabel(formData.endPlaceText, endTarget)
      const createdOrder = await createOrder({
        start_point: {
          x: startPoint.point.x,
          y: startPoint.point.y,
          label_text: startLabel,
        },
        end_point: {
          x: endTarget.deliveryPoint.x,
          y: endTarget.deliveryPoint.y,
          label_text: endLabel,
        },
      })

      selectedOrderId.value = createdOrder.id
      addLog(`手动订单创建成功：${startLabel} -> ${endLabel}。`)
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`手动订单创建失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  async function handleResetDemo() {
    try {
      demoState.value = await resetDemoScene()
      selectedOrderId.value = null
      selectedOrderDetail.value = null
      selectedOrderEvents.value = []
      addLog('演示场景已重置，自动仿真已暂停。')
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`演示重置失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  async function handleCreateDemoOrders(createAction, successText) {
    try {
      const result = await createAction()
      demoState.value = result
      selectedOrderId.value = result.orders?.[0]?.id || null
      addLog(successText)
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`演示订单创建失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  function handleCreateOneDemoOrder() {
    return handleCreateDemoOrders(createOneDemoOrder, '已创建 1 单标准演示订单。')
  }

  function handleCreateFiveDemoOrders() {
    return handleCreateDemoOrders(createFiveDemoOrders, '已创建 5 单标准演示订单。')
  }

  async function handleRestoreAutoSimulation() {
    try {
      demoState.value = await setDemoMode(false)
      addLog('已恢复自动仿真订单生成。')
      await refreshData()
      return { ok: true }
    } catch (error) {
      addLog(`恢复自动仿真失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  async function handleSetDemoSpeed(speed) {
    try {
      cancelActiveRefresh()
      demoState.value = await setDemoSpeed(speed)
      addLog(`演示倍速已切换为 ${speed}x。`)
      scheduleNextRefresh()
      return { ok: true }
    } catch (error) {
      addLog(`演示倍速切换失败：${error.message}`)
      return { ok: false, message: error.message }
    }
  }

  return {
    handleCreateFiveDemoOrders,
    handleCreateOneDemoOrder,
    handleResetDemo,
    handleRestoreAutoSimulation,
    handleSetDemoSpeed,
    submitOrder,
  }
}
