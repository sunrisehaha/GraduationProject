// 园区业务地图校验：检查点位是否越界、是否落在建筑禁行区，以及关键链路是否可达。

import {
  campusBusinessMap,
  campusDeliveryTargets,
  distanceToNearestRoad,
  isBlockedPoint,
} from './campusBusinessMap.js'

function inBounds(point) {
  return (
    point.x >= 0 &&
    point.x < campusBusinessMap.gridCols &&
    point.y >= 0 &&
    point.y < campusBusinessMap.gridRows
  )
}

function findGridPath(start, end) {
  if (!inBounds(start) || !inBounds(end) || isBlockedPoint(start) || isBlockedPoint(end)) {
    return []
  }

  const startKey = `${start.x},${start.y}`
  const endKey = `${end.x},${end.y}`
  const queue = [start]
  const cameFrom = new Map()
  const visited = new Set([startKey])
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  while (queue.length) {
    const current = queue.shift()
    const currentKey = `${current.x},${current.y}`

    if (currentKey === endKey) {
      const path = [current]
      let cursorKey = currentKey

      while (cameFrom.has(cursorKey)) {
        const previous = cameFrom.get(cursorKey)
        path.push(previous)
        cursorKey = `${previous.x},${previous.y}`
      }

      return path.reverse()
    }

    directions.forEach(([dx, dy]) => {
      const next = { x: current.x + dx, y: current.y + dy }
      const nextKey = `${next.x},${next.y}`

      if (!inBounds(next) || isBlockedPoint(next) || visited.has(nextKey)) {
        return
      }

      visited.add(nextKey)
      cameFrom.set(nextKey, current)
      queue.push(next)
    })
  }

  return []
}

function validateServicePoint(pointItem) {
  const { point } = pointItem
  const issues = []

  if (!inBounds(point)) {
    issues.push('越界')
  }

  if (isBlockedPoint(point)) {
    issues.push('落在禁行建筑区')
  }

  const roadDistance = distanceToNearestRoad(point)
  if (roadDistance > pointItem.maxRoadDistance) {
    issues.push(`距离最近道路过远，当前距离 ${roadDistance}`)
  }

  return {
    id: pointItem.id,
    point,
    valid: issues.length === 0,
    issues,
  }
}

export function validateCampusBusinessMap() {
  const pointReports = campusBusinessMap.servicePoints.map(validateServicePoint)
  const pointMap = Object.fromEntries(
    campusBusinessMap.servicePoints.map((item) => [item.id, item.point])
  )

  const routePairs = [
    ['gate_north', 'hub_dispatch_loading'],
    ['gate_south', 'hub_dispatch_loading'],
    ['hub_dispatch_waiting', 'hub_dispatch_loading'],
    ...campusDeliveryTargets.map((target) => ['hub_dispatch_loading', target.deliveryPointId]),
  ]

  const routeReports = routePairs.map(([startId, endId]) => {
    const path = findGridPath(pointMap[startId], pointMap[endId])

    return {
      startId,
      endId,
      valid: path.length > 0,
      pathLength: path.length,
    }
  })

  return {
    valid:
      pointReports.every((item) => item.valid) && routeReports.every((item) => item.valid),
    pointReports,
    routeReports,
  }
}
