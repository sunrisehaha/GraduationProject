// 2.5D 地图绘制模块：把订单、小车和路径数据渲染成园区监控画面。
import { onBeforeUnmount, onMounted, watch } from 'vue'

const gridCols = 20
const gridRows = 12

const obstacles = [
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 5, y: 7 },
  { x: 12, y: 3 },
  { x: 12, y: 4 },
]

const roadRows = new Set([2, 6, 9])
const roadCols = new Set([3, 8, 14, 17])

// 场景配置：统一控制 2.5D 地图的尺寸、原点和地块厚度
const scene = {
  tileWidth: 38,
  tileHeight: 19,
  originX: 488,
  originY: 126,
  baseHeight: 16,
}

// 坐标转换：把网格坐标映射为等角视图中的屏幕坐标
function gridToScreen(x, y, z = 0) {
  return {
    x: scene.originX + ((x - y) * scene.tileWidth) / 2,
    y: scene.originY + ((x + y) * scene.tileHeight) / 2 - z,
  }
}

// 地块顶点：后续绘制地面、建筑和路径都依赖这些点位
function getTilePoints(x, y, z = 0) {
  const center = gridToScreen(x, y, z)

  return {
    top: { x: center.x, y: center.y - scene.tileHeight / 2 },
    right: { x: center.x + scene.tileWidth / 2, y: center.y },
    bottom: { x: center.x, y: center.y + scene.tileHeight / 2 },
    left: { x: center.x - scene.tileWidth / 2, y: center.y },
    center,
  }
}

// 多边形工具：统一封装建筑和地面块的绘制
function fillPolygon(ctx, points, fillStyle, strokeStyle = null) {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y)
  }

  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()

  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.stroke()
  }
}

// 地图格子判断：区分障碍物与道路
function isObstacleCell(x, y) {
  return obstacles.some((item) => item.x === x && item.y === y)
}

function isRoadCell(x, y) {
  return roadRows.has(y) || roadCols.has(x) || (x >= 8 && x <= 11 && y >= 4 && y <= 7)
}

// 背景层：绘制天空与氛围光
function drawBackground(ctx, canvas) {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height)
  sky.addColorStop(0, '#07131f')
  sky.addColorStop(0.45, '#0a1d31')
  sky.addColorStop(1, '#091622')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(74, 167, 255, 0.08)'
  ctx.beginPath()
  ctx.ellipse(canvas.width / 2, 76, 220, 54, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(120, 255, 214, 0.06)'
  ctx.beginPath()
  ctx.ellipse(canvas.width / 2, canvas.height - 68, 290, 48, 0, 0, Math.PI * 2)
  ctx.fill()
}

// 地面投影：增强整个园区的立体感
function drawGroundShadow(ctx) {
  const top = gridToScreen(0, 0)
  const right = gridToScreen(gridCols - 1, 0)
  const bottom = gridToScreen(gridCols - 1, gridRows - 1)
  const left = gridToScreen(0, gridRows - 1)

  fillPolygon(
    ctx,
    [
      { x: top.x, y: top.y + 20 },
      { x: right.x + 24, y: right.y + 32 },
      { x: bottom.x, y: bottom.y + 54 },
      { x: left.x - 24, y: left.y + 32 },
    ],
    'rgba(0, 0, 0, 0.26)'
  )
}

// 单格地块：根据道路或绿地区分配色
function drawTileSurface(ctx, x, y) {
  const points = getTilePoints(x, y)
  const isRoad = isRoadCell(x, y)
  const topColor = isRoad ? '#3f556e' : '#3b7c57'
  const leftColor = isRoad ? '#33475f' : '#2f6245'
  const rightColor = isRoad ? '#4c6681' : '#468f63'

  fillPolygon(
    ctx,
    [points.top, points.right, points.bottom, points.left],
    topColor,
    'rgba(10, 20, 30, 0.15)'
  )

  fillPolygon(
    ctx,
    [
      points.left,
      points.bottom,
      { x: points.bottom.x, y: points.bottom.y + scene.baseHeight },
      { x: points.left.x, y: points.left.y + scene.baseHeight },
    ],
    leftColor
  )

  fillPolygon(
    ctx,
    [
      points.right,
      points.bottom,
      { x: points.bottom.x, y: points.bottom.y + scene.baseHeight },
      { x: points.right.x, y: points.right.y + scene.baseHeight },
    ],
    rightColor
  )

  if (isRoad) {
    ctx.strokeStyle = 'rgba(188, 220, 255, 0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(points.left.x + 4, points.left.y)
    ctx.lineTo(points.right.x - 4, points.right.y)
    ctx.stroke()
  } else {
    ctx.fillStyle = 'rgba(130, 210, 152, 0.18)'
    ctx.beginPath()
    ctx.ellipse(points.center.x, points.center.y - 1, 5, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 地面层：逐格绘制整个底板
function drawGround(ctx) {
  drawGroundShadow(ctx)

  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      drawTileSurface(ctx, x, y)
    }
  }
}

// 道路装饰：补充道路纹理细节
function drawRoadDecorations(ctx) {
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      if (!isRoadCell(x, y)) {
        continue
      }

      const point = gridToScreen(x, y)

      if ((x + y) % 3 === 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.moveTo(point.x - 6, point.y)
        ctx.lineTo(point.x + 6, point.y)
        ctx.stroke()
      }
    }
  }
}

// 绿化层：在空地上绘制树木点缀
function drawGreenBelts(ctx) {
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      if (isRoadCell(x, y) || isObstacleCell(x, y)) {
        continue
      }

      if ((x + y) % 4 !== 1) {
        continue
      }

      const point = gridToScreen(x, y, 18)
      const trunk = gridToScreen(x, y, 6)

      ctx.strokeStyle = '#5e4330'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(trunk.x, trunk.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()

      ctx.fillStyle = '#73d58d'
      ctx.beginPath()
      ctx.arc(point.x, point.y - 2, 9, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#4fa96e'
      ctx.beginPath()
      ctx.arc(point.x - 4, point.y + 2, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// 建筑体块：使用顶面与两个立面组合成立体建筑
function drawBuilding(ctx, x, y, levels = 3, palette = {}) {
  const height = levels * 18
  const base = getTilePoints(x, y)
  const top = getTilePoints(x, y, height)

  const roofColor = palette.roof || '#9db2c9'
  const leftColor = palette.left || '#65788e'
  const rightColor = palette.right || '#8299b1'

  fillPolygon(ctx, [top.top, top.right, base.right, base.top], rightColor)
  fillPolygon(ctx, [top.top, top.left, base.left, base.top], leftColor)
  fillPolygon(
    ctx,
    [top.top, top.right, top.bottom, top.left],
    roofColor,
    'rgba(16, 32, 48, 0.22)'
  )

  ctx.fillStyle = 'rgba(200, 236, 255, 0.4)'
  ctx.fillRect(top.center.x - 6, top.center.y - 7, 12, 4)
}

// 建筑层：障碍物建筑与额外楼宇一起绘制
function drawBuildings(ctx) {
  obstacles.forEach((item, index) => {
    drawBuilding(ctx, item.x, item.y, 3 + (index % 2), {
      roof: index % 2 === 0 ? '#9cb8d2' : '#b7c6d9',
      left: index % 2 === 0 ? '#6c8398' : '#76869a',
      right: index % 2 === 0 ? '#8ea6be' : '#96a8bd',
    })
  })

  drawBuilding(ctx, 15, 8, 4, {
    roof: '#b9cfdf',
    left: '#748a98',
    right: '#94aebe',
  })
  drawBuilding(ctx, 16, 8, 3, {
    roof: '#adc5d7',
    left: '#6e8897',
    right: '#8aa6b7',
  })
  drawBuilding(ctx, 2, 9, 3, {
    roof: '#a8c0cf',
    left: '#6d8290',
    right: '#88a0b1',
  })
}

// 路径层：高亮当前任务路径
function drawPath(ctx, path) {
  if (!path.length) {
    return
  }

  ctx.save()
  ctx.strokeStyle = '#59d4ff'
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.shadowBlur = 12
  ctx.shadowColor = 'rgba(89, 212, 255, 0.45)'
  ctx.beginPath()

  path.forEach((point, index) => {
    const center = gridToScreen(point.x, point.y, 10)

    if (index === 0) {
      ctx.moveTo(center.x, center.y)
    } else {
      ctx.lineTo(center.x, center.y)
    }
  })

  ctx.stroke()
  ctx.shadowBlur = 0

  path.forEach((point, index) => {
    const center = gridToScreen(point.x, point.y, 10)
    ctx.fillStyle = index === 0 ? '#6cffb2' : '#8fe9ff'
    ctx.beginPath()
    ctx.arc(center.x, center.y, index === 0 ? 5 : 3.6, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.restore()
}

// 订单标记：只显示未完成订单的起终点
function drawOrderMarkers(ctx, orders) {
  orders
    .filter((order) => order.status !== 'completed')
    .forEach((order) => {
      const start = gridToScreen(order.start_point.x, order.start_point.y, 22)
      const end = gridToScreen(order.end_point.x, order.end_point.y, 22)

      ctx.strokeStyle = 'rgba(115, 255, 189, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(start.x, start.y + 10)
      ctx.lineTo(start.x, start.y - 10)
      ctx.stroke()

      ctx.fillStyle = '#3ddc97'
      ctx.beginPath()
      ctx.arc(start.x, start.y - 14, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = 'rgba(255, 120, 120, 0.85)'
      ctx.beginPath()
      ctx.moveTo(end.x, end.y + 10)
      ctx.lineTo(end.x, end.y - 10)
      ctx.stroke()

      ctx.fillStyle = '#ff6b6b'
      ctx.beginPath()
      ctx.arc(end.x, end.y - 14, 5, 0, Math.PI * 2)
      ctx.fill()
    })
}

// 小车造型：用简单几何形状表达机器人小车
function drawCartBody(ctx, center, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(center.x, center.y - 12)
  ctx.lineTo(center.x + 12, center.y - 4)
  ctx.lineTo(center.x, center.y + 4)
  ctx.lineTo(center.x - 12, center.y - 4)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = 'rgba(8, 17, 29, 0.86)'
  ctx.beginPath()
  ctx.arc(center.x - 6, center.y + 3, 3, 0, Math.PI * 2)
  ctx.arc(center.x + 6, center.y + 3, 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#d8f4ff'
  ctx.fillRect(center.x - 4, center.y - 11, 8, 4)
}

// 小车层：渲染所有小车的实时位置
function drawCarts(ctx, carts) {
  carts.forEach((cart) => {
    const center = gridToScreen(cart.x, cart.y, 22)
    const isIdle = cart.status === 'idle'

    ctx.save()
    ctx.shadowBlur = 18
    ctx.shadowColor = isIdle ? 'rgba(120, 255, 214, 0.45)' : 'rgba(255, 180, 84, 0.55)'
    drawCartBody(ctx, center, isIdle ? '#78ffd6' : '#ffb454')
    ctx.restore()

    ctx.fillStyle = '#e8f3ff'
    ctx.font = '12px "Segoe UI"'
    ctx.textAlign = 'center'
    ctx.fillText(cart.name, center.x, center.y - 18)
    ctx.textAlign = 'start'
  })
}

// 园区边界：勾勒整个地图范围
function drawParkBorder(ctx) {
  const top = gridToScreen(0, 0)
  const right = gridToScreen(gridCols - 1, 0)
  const bottom = gridToScreen(gridCols - 1, gridRows - 1)
  const left = gridToScreen(0, gridRows - 1)

  ctx.strokeStyle = 'rgba(134, 208, 255, 0.24)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(top.x, top.y - scene.tileHeight / 2)
  ctx.lineTo(right.x + scene.tileWidth / 2, right.y)
  ctx.lineTo(bottom.x, bottom.y + scene.tileHeight / 2)
  ctx.lineTo(left.x - scene.tileWidth / 2, left.y)
  ctx.closePath()
  ctx.stroke()
}

// 场景标签：增强演示时的区域可读性
function drawSceneLabels(ctx) {
  ctx.fillStyle = 'rgba(232, 243, 255, 0.72)'
  ctx.font = '13px "Segoe UI"'
  ctx.fillText('建筑区 A', gridToScreen(5, 5, 88).x - 12, gridToScreen(5, 5, 88).y)
  ctx.fillText('综合楼', gridToScreen(15, 8, 96).x - 10, gridToScreen(15, 8, 96).y)
  ctx.fillText('中心道路', gridToScreen(9, 6, 18).x - 16, gridToScreen(9, 6, 18).y)
}

// 地图总入口：按图层顺序绘制完整 2.5D 园区场景
function drawMap(ctx, canvas, sceneData) {
  drawBackground(ctx, canvas)
  drawGround(ctx)
  drawRoadDecorations(ctx)
  drawGreenBelts(ctx)
  drawBuildings(ctx)
  drawPath(ctx, sceneData.currentPath || [])
  drawOrderMarkers(ctx, sceneData.orders || [])
  drawCarts(ctx, sceneData.carts || [])
  drawParkBorder(ctx)
  drawSceneLabels(ctx)
}

export function useMapScene(canvasRef, sceneDataRef) {
  // 渲染入口：每次拿到最新业务数据后，重画整张地图。
  function renderScene() {
    const canvas = canvasRef.value

    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')

    if (!ctx) {
      return
    }

    // 画布宽度会跟随响应式布局变化，这里动态修正地图中心点。
    scene.originX = canvas.width / 2
    drawMap(ctx, canvas, sceneDataRef.value)
  }

  onMounted(() => {
    renderScene()
  })

  watch(
    sceneDataRef,
    () => {
      renderScene()
    },
    {
      deep: true,
      immediate: true,
    }
  )

  onBeforeUnmount(() => {
    // 组件卸载时清空画布，避免残留上一次的图像。
    const canvas = canvasRef.value

    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')

    if (!ctx) {
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
  })

  return {
    renderScene,
  }
}
