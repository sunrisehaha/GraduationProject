// 园区业务地图规则：前端只读取 shared/campus_rules.json，避免 2D、3D、路径规划各写一套地图。

import campusRules from '../../../shared/campus_rules.json' with { type: 'json' }

const gridCols = campusRules.grid.cols
const gridRows = campusRules.grid.rows

export const campusNamingRules = campusRules.namingRules

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

function distancePointToRect(point, rect) {
  const right = rect.x + rect.width - 1
  const bottom = rect.y + rect.height - 1
  const dx = point.x < rect.x ? rect.x - point.x : point.x > right ? point.x - right : 0
  const dy = point.y < rect.y ? rect.y - point.y : point.y > bottom ? point.y - bottom : 0
  return dx + dy
}

function normalizeZone(zone) {
  return {
    aliases: [],
    addressExamples: [],
    deliveryPointId: null,
    orderDensity: 'medium',
    cartPassable: false,
    pedestrianPassable: false,
    reserveUse: 'building',
    ...zone,
  }
}

function normalizeRoad(road) {
  return {
    vehicleType: 'road',
    ...road,
  }
}

function normalizeServicePoint(point) {
  return {
    aliases: [],
    targetZoneId: null,
    maxRoadDistance: 0,
    ...point,
  }
}

function pointKey(point) {
  return `${point.x}:${point.y}`
}

function normalizePlaceText(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase()
}

function isZonePoint(point, predicate) {
  return campusZones.some((zone) => predicate(zone) && pointInRect(point, zone.rect))
}

function isVehicleReserveZone(zone) {
  return zone.cartPassable === true && ['parking', 'logistics'].includes(zone.reserveUse)
}

export const campusZones = campusRules.zones.map(normalizeZone)
export const campusRoadCorridors = campusRules.roads.map(normalizeRoad)
export const campusServicePoints = campusRules.servicePoints.map(normalizeServicePoint)
export const campusScaleRules = campusRules.scaleRules

const pointObstacleKeys = new Set(
  (campusRules.pointObstacles || []).map((item) => pointKey(item.point))
)

export function isBlockedPoint(point) {
  return pointObstacleKeys.has(pointKey(point)) || isZonePoint(point, (zone) => zone.cartPassable === false)
}

export function isRoadPoint(point) {
  return campusRoadCorridors.some((road) => pointInRect(point, road.rect))
}

export function isVehicleAccessiblePoint(point) {
  if (point.x < 0 || point.x >= gridCols || point.y < 0 || point.y >= gridRows || isBlockedPoint(point)) {
    return false
  }

  return isRoadPoint(point) || isZonePoint(point, isVehicleReserveZone)
}

export function distanceToNearestVehiclePath(point) {
  const roadDistances = campusRoadCorridors.map((road) => distancePointToRect(point, road.rect))
  const reserveDistances = campusZones
    .filter(isVehicleReserveZone)
    .map((zone) => distancePointToRect(point, zone.rect))

  return Math.min(...roadDistances, ...reserveDistances)
}

export function getZoneByPoint(point) {
  return campusZones.find((zone) => pointInRect(point, zone.rect)) || null
}

export function getZoneById(id) {
  return campusZones.find((zone) => zone.id === id) || null
}

export function getServicePointById(id) {
  return campusServicePoints.find((point) => point.id === id) || null
}

export function getOrderPlaceLabel(name) {
  return String(name || '').replace(/收件点$/, '').trim()
}

export const campusBuildingCatalog = campusZones.filter((zone) => zone.deliveryPointId)

export const campusDeliveryTargets = campusBuildingCatalog.map((zone) => {
  const servicePoint = getServicePointById(zone.deliveryPointId)

  return {
    id: zone.id,
    name: zone.name,
    kind: zone.kind,
    orderDensity: zone.orderDensity,
    aliases: zone.aliases,
    addressExamples: zone.addressExamples,
    deliveryPointId: zone.deliveryPointId,
    deliveryPoint: servicePoint?.point || null,
    deliveryPointName: servicePoint?.name || '',
  }
})

// 地点匹配：把“1栋101室、综合楼”这类输入映射到楼下收件点。
export function findDeliveryTargetByText(text) {
  const keyword = normalizePlaceText(text)

  if (!keyword) {
    return null
  }

  return (
    campusDeliveryTargets.find((target) =>
      [target.name, ...target.aliases, ...target.addressExamples]
        .map(normalizePlaceText)
        .some((item) => keyword.includes(item) || item.includes(keyword))
    ) || null
  )
}

export const campusBusinessMap = {
  gridCols,
  gridRows,
  namingRules: campusNamingRules,
  zones: campusZones,
  roads: campusRoadCorridors,
  servicePoints: campusServicePoints,
  buildings: campusBuildingCatalog,
  deliveryTargets: campusDeliveryTargets,
  scaleRules: campusScaleRules,
}
