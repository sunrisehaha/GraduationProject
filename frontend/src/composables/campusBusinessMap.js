// 园区业务地图规则：集中定义建筑清单、楼栋收件点、主路骨架和地点命名规范。

const gridCols = 40
const gridRows = 35

// 命名规范：后面 Blender 命名、地址映射和前端语义都按这套前缀走。
export const campusNamingRules = {
  residential: 'building_residential_<number>',
  publicBuilding: 'building_<category>_<name>',
  hub: 'hub_<business>_<name>',
  gate: 'gate_<direction>',
  parking: 'parking_<purpose>',
  obstacle: 'obstacle_<type>_<index>',
  road: 'road_<direction>_<index>',
  marker: 'marker_<target>_<name>',
}

function createRectArea(x, y, width, height) {
  return { x, y, width, height }
}

function createZone(config) {
  return {
    passable: false,
    aliases: [],
    addressExamples: [],
    orderDensity: 'medium',
    deliveryPointId: null,
    ...config,
  }
}

function createServicePoint(config) {
  return {
    aliases: [],
    maxRoadDistance: 0,
    targetZoneId: null,
    ...config,
  }
}

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

// 建筑清单：保留 40 x 35 网格规模，但把原来的大体块细分成 8 栋住宅和多栋公共建筑。
export const campusZones = [
  createZone({
    id: 'building_residential_1',
    name: '1栋住宅楼',
    kind: 'residential',
    rect: createRectArea(4, 3, 2, 3),
    heightLevel: 'high',
    description: '北侧住宅组 1 号楼，高频上门送件点。',
    aliases: ['1栋', '1号楼', '1栋楼', '1栋住宅楼'],
    addressExamples: ['1栋101室', '1栋202室', '1栋1单元302室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_1_dropoff',
  }),
  createZone({
    id: 'building_residential_2',
    name: '2栋住宅楼',
    kind: 'residential',
    rect: createRectArea(8, 3, 2, 3),
    heightLevel: 'high',
    description: '北侧住宅组 2 号楼，高频上门送件点。',
    aliases: ['2栋', '2号楼', '2栋楼', '2栋住宅楼'],
    addressExamples: ['2栋101室', '2栋202室', '2栋2单元401室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_2_dropoff',
  }),
  createZone({
    id: 'building_residential_3',
    name: '3栋住宅楼',
    kind: 'residential',
    rect: createRectArea(4, 7, 2, 3),
    heightLevel: 'high',
    description: '北侧住宅组 3 号楼，高频上门送件点。',
    aliases: ['3栋', '3号楼', '3栋楼', '3栋住宅楼'],
    addressExamples: ['3栋101室', '3栋302室', '3栋2单元501室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_3_dropoff',
  }),
  createZone({
    id: 'building_residential_4',
    name: '4栋住宅楼',
    kind: 'residential',
    rect: createRectArea(8, 7, 2, 3),
    heightLevel: 'high',
    description: '北侧住宅组 4 号楼，高频上门送件点。',
    aliases: ['4栋', '4号楼', '4栋楼', '4栋住宅楼'],
    addressExamples: ['4栋101室', '4栋201室', '4栋2单元301室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_4_dropoff',
  }),
  createZone({
    id: 'building_residential_5',
    name: '5栋住宅楼',
    kind: 'residential',
    rect: createRectArea(4, 22, 2, 3),
    heightLevel: 'high',
    description: '南侧住宅组 5 号楼，高频上门送件点。',
    aliases: ['5栋', '5号楼', '5栋楼', '5栋住宅楼'],
    addressExamples: ['5栋101室', '5栋202室', '5栋1单元401室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_5_dropoff',
  }),
  createZone({
    id: 'building_residential_6',
    name: '6栋住宅楼',
    kind: 'residential',
    rect: createRectArea(8, 22, 2, 3),
    heightLevel: 'high',
    description: '南侧住宅组 6 号楼，高频上门送件点。',
    aliases: ['6栋', '6号楼', '6栋楼', '6栋住宅楼'],
    addressExamples: ['6栋101室', '6栋302室', '6栋2单元501室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_6_dropoff',
  }),
  createZone({
    id: 'building_residential_7',
    name: '7栋住宅楼',
    kind: 'residential',
    rect: createRectArea(4, 26, 2, 3),
    heightLevel: 'high',
    description: '南侧住宅组 7 号楼，高频上门送件点。',
    aliases: ['7栋', '7号楼', '7栋楼', '7栋住宅楼'],
    addressExamples: ['7栋101室', '7栋202室', '7栋2单元301室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_7_dropoff',
  }),
  createZone({
    id: 'building_residential_8',
    name: '8栋住宅楼',
    kind: 'residential',
    rect: createRectArea(8, 26, 2, 3),
    heightLevel: 'high',
    description: '南侧住宅组 8 号楼，高频上门送件点。',
    aliases: ['8栋', '8号楼', '8栋楼', '8栋住宅楼'],
    addressExamples: ['8栋101室', '8栋303室', '8栋2单元502室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_residential_8_dropoff',
  }),
  createZone({
    id: 'building_resident_service',
    name: '住户服务大楼',
    kind: 'service',
    rect: createRectArea(17, 4, 4, 4),
    heightLevel: 'mid',
    description: '物业、民生服务和前台咨询集中办理点。',
    aliases: ['住户服务大楼', '住户服务中心', '服务大楼'],
    addressExamples: ['住户服务大楼一层大厅', '住户服务大楼前台'],
    orderDensity: 'medium',
    deliveryPointId: 'marker_resident_service_dropoff',
  }),
  createZone({
    id: 'building_party_center',
    name: '党群服务中心',
    kind: 'community',
    rect: createRectArea(23, 4, 3, 4),
    heightLevel: 'mid',
    description: '社区活动、党群事务和公共会议的服务楼。',
    aliases: ['党群服务中心', '党群中心', '社区党群中心'],
    addressExamples: ['党群服务中心前台', '党群服务中心会议室'],
    orderDensity: 'medium',
    deliveryPointId: 'marker_party_center_dropoff',
  }),
  createZone({
    id: 'building_property_center',
    name: '物业管理中心',
    kind: 'property',
    rect: createRectArea(32, 4, 3, 4),
    heightLevel: 'mid',
    description: '设备报修、安防联动和园区运营值守中心。',
    aliases: ['物业管理中心', '物业中心', '物业办公室'],
    addressExamples: ['物业管理中心值班室', '物业管理中心前台'],
    orderDensity: 'medium',
    deliveryPointId: 'marker_property_center_dropoff',
  }),
  createZone({
    id: 'hub_express_main',
    name: '快递服务中心',
    kind: 'logistics',
    rect: createRectArea(31, 9, 4, 3),
    heightLevel: 'mid',
    description: '统一入库、分拣和装货的物流枢纽。',
    aliases: ['快递服务中心', '快递站', '物流中心'],
    addressExamples: ['快递服务中心装货口', '快递服务中心分拣区'],
    orderDensity: 'high',
  }),
  createZone({
    id: 'building_sports_center',
    name: '运动健身中心',
    kind: 'sports',
    rect: createRectArea(17, 22, 4, 5),
    heightLevel: 'mid',
    description: '园区运动、健身和活动课程使用的公共楼。',
    aliases: ['运动健身中心', '健身中心', '运动中心'],
    addressExamples: ['运动健身中心前台', '运动健身中心器械区'],
    orderDensity: 'medium',
    deliveryPointId: 'marker_sports_center_dropoff',
  }),
  createZone({
    id: 'building_comprehensive',
    name: '综合楼',
    kind: 'admin',
    rect: createRectArea(22, 22, 4, 5),
    heightLevel: 'mid',
    description: '行政、办公和多部门协同办公的综合楼。',
    aliases: ['综合楼', '办公综合楼', '综合服务楼'],
    addressExamples: ['综合楼一层大厅', '综合楼三层办公室'],
    orderDensity: 'high',
    deliveryPointId: 'marker_comprehensive_dropoff',
  }),
  createZone({
    id: 'building_power_room',
    name: '发电间',
    kind: 'utility',
    rect: createRectArea(33, 24, 2, 3),
    heightLevel: 'low',
    description: '备用供电和设备保障房，低频但真实感很强。',
    aliases: ['发电间', '设备保障房', '电力设备间'],
    addressExamples: ['发电间值守点', '设备保障房门口'],
    orderDensity: 'low',
    deliveryPointId: 'marker_power_room_dropoff',
  }),
  createZone({
    id: 'greenbelt_central',
    name: '中央绿化隔离带',
    kind: 'greenbelt',
    rect: createRectArea(17, 14, 3, 5),
    heightLevel: 'low',
    passable: false,
    description: '中央景观隔离带，只负责视觉层次，不允许小车穿行。',
  }),
]

// 主路走廊：主干道 + 楼前服务车道一起定义，后面 Blender 铺路就照这个骨架走。
export const campusRoadCorridors = [
  { id: 'road_vertical_west', name: '西侧纵向主路', direction: 'vertical', rect: createRectArea(13, 0, 3, 35) },
  { id: 'road_vertical_east', name: '东侧纵向主路', direction: 'vertical', rect: createRectArea(28, 0, 3, 35) },
  { id: 'road_horizontal_north', name: '北侧横向主路', direction: 'horizontal', rect: createRectArea(0, 12, 40, 3) },
  { id: 'road_horizontal_mid', name: '中央横向主路', direction: 'horizontal', rect: createRectArea(0, 18, 40, 3) },
  { id: 'road_horizontal_south', name: '南侧横向主路', direction: 'horizontal', rect: createRectArea(0, 29, 40, 3) },
  { id: 'road_residential_north_upper', name: '北侧住宅上排服务车道', direction: 'horizontal', rect: createRectArea(0, 6, 13, 1) },
  { id: 'road_residential_north_lower', name: '北侧住宅下排服务车道', direction: 'horizontal', rect: createRectArea(0, 10, 13, 1) },
  { id: 'road_public_north', name: '北侧公共建筑门前车道', direction: 'horizontal', rect: createRectArea(16, 8, 20, 1) },
  { id: 'road_public_south', name: '南侧公共建筑门前车道', direction: 'horizontal', rect: createRectArea(16, 21, 20, 1) },
  { id: 'road_residential_south_upper', name: '南侧住宅上排服务车道', direction: 'horizontal', rect: createRectArea(0, 25, 13, 1) },
  { id: 'road_utility_east', name: '东南设备服务车道', direction: 'horizontal', rect: createRectArea(30, 27, 6, 1) },
]

// 业务点位：这一层不再是抽象几个点，而是每栋楼一个稳定收件点。
export const campusServicePoints = [
  createServicePoint({
    id: 'gate_north',
    name: '北门岗',
    type: 'gate',
    point: { x: 14, y: 1 },
    role: '主入口和访客出入点',
    aliases: ['北门', '北门岗'],
  }),
  createServicePoint({
    id: 'gate_south',
    name: '南门岗',
    type: 'gate',
    point: { x: 29, y: 33 },
    role: '南侧入口和车辆离场点',
    aliases: ['南门', '南门岗'],
  }),
  createServicePoint({
    id: 'hub_dispatch_loading',
    name: '快递装货口',
    type: 'hub',
    point: { x: 30, y: 10 },
    role: '小车统一装货点',
    aliases: ['装货口', '快递装货口'],
    targetZoneId: 'hub_express_main',
  }),
  createServicePoint({
    id: 'marker_express_pickup',
    name: '快递出件口',
    type: 'pickup',
    point: { x: 33, y: 12 },
    role: '快递从仓配区发出的业务起点',
    aliases: ['出件口', '快递站出件口'],
    targetZoneId: 'hub_express_main',
  }),
  createServicePoint({
    id: 'hub_dispatch_waiting',
    name: '调度等待区',
    type: 'parking',
    point: { x: 15, y: 28 },
    role: '空闲小车停车和待命区域',
    aliases: ['等待区', '调度等待区', '停车等待区'],
  }),
  createServicePoint({
    id: 'marker_residential_1_dropoff',
    name: '1栋住宅楼收件点',
    type: 'delivery',
    point: { x: 5, y: 6 },
    role: '1栋楼下统一收件点',
    aliases: ['1栋楼下', '1栋收件点'],
    targetZoneId: 'building_residential_1',
  }),
  createServicePoint({
    id: 'marker_residential_2_dropoff',
    name: '2栋住宅楼收件点',
    type: 'delivery',
    point: { x: 9, y: 6 },
    role: '2栋楼下统一收件点',
    aliases: ['2栋楼下', '2栋收件点'],
    targetZoneId: 'building_residential_2',
  }),
  createServicePoint({
    id: 'marker_residential_3_dropoff',
    name: '3栋住宅楼收件点',
    type: 'delivery',
    point: { x: 5, y: 10 },
    role: '3栋楼下统一收件点',
    aliases: ['3栋楼下', '3栋收件点'],
    targetZoneId: 'building_residential_3',
  }),
  createServicePoint({
    id: 'marker_residential_4_dropoff',
    name: '4栋住宅楼收件点',
    type: 'delivery',
    point: { x: 9, y: 10 },
    role: '4栋楼下统一收件点',
    aliases: ['4栋楼下', '4栋收件点'],
    targetZoneId: 'building_residential_4',
  }),
  createServicePoint({
    id: 'marker_residential_5_dropoff',
    name: '5栋住宅楼收件点',
    type: 'delivery',
    point: { x: 5, y: 25 },
    role: '5栋楼下统一收件点',
    aliases: ['5栋楼下', '5栋收件点'],
    targetZoneId: 'building_residential_5',
  }),
  createServicePoint({
    id: 'marker_residential_6_dropoff',
    name: '6栋住宅楼收件点',
    type: 'delivery',
    point: { x: 9, y: 25 },
    role: '6栋楼下统一收件点',
    aliases: ['6栋楼下', '6栋收件点'],
    targetZoneId: 'building_residential_6',
  }),
  createServicePoint({
    id: 'marker_residential_7_dropoff',
    name: '7栋住宅楼收件点',
    type: 'delivery',
    point: { x: 5, y: 29 },
    role: '7栋楼下统一收件点',
    aliases: ['7栋楼下', '7栋收件点'],
    targetZoneId: 'building_residential_7',
  }),
  createServicePoint({
    id: 'marker_residential_8_dropoff',
    name: '8栋住宅楼收件点',
    type: 'delivery',
    point: { x: 9, y: 29 },
    role: '8栋楼下统一收件点',
    aliases: ['8栋楼下', '8栋收件点'],
    targetZoneId: 'building_residential_8',
  }),
  createServicePoint({
    id: 'marker_resident_service_dropoff',
    name: '住户服务大楼收件点',
    type: 'delivery',
    point: { x: 19, y: 8 },
    role: '住户服务大楼门前收件点',
    aliases: ['住户服务大楼门口', '住户服务大楼收件点'],
    targetZoneId: 'building_resident_service',
  }),
  createServicePoint({
    id: 'marker_party_center_dropoff',
    name: '党群服务中心收件点',
    type: 'delivery',
    point: { x: 24, y: 8 },
    role: '党群服务中心门前收件点',
    aliases: ['党群服务中心门口', '党群中心收件点'],
    targetZoneId: 'building_party_center',
  }),
  createServicePoint({
    id: 'marker_property_center_dropoff',
    name: '物业管理中心收件点',
    type: 'delivery',
    point: { x: 33, y: 8 },
    role: '物业管理中心门前收件点',
    aliases: ['物业中心门口', '物业管理中心收件点'],
    targetZoneId: 'building_property_center',
  }),
  createServicePoint({
    id: 'marker_sports_center_dropoff',
    name: '运动健身中心收件点',
    type: 'delivery',
    point: { x: 19, y: 21 },
    role: '运动健身中心门前收件点',
    aliases: ['运动健身中心门口', '健身中心收件点'],
    targetZoneId: 'building_sports_center',
  }),
  createServicePoint({
    id: 'marker_comprehensive_dropoff',
    name: '综合楼收件点',
    type: 'delivery',
    point: { x: 24, y: 21 },
    role: '综合楼门前收件点',
    aliases: ['综合楼门口', '综合楼收件点'],
    targetZoneId: 'building_comprehensive',
  }),
  createServicePoint({
    id: 'marker_power_room_dropoff',
    name: '发电间收件点',
    type: 'delivery',
    point: { x: 33, y: 27 },
    role: '设备保障房门前低频收件点',
    aliases: ['发电间门口', '设备保障房收件点'],
    targetZoneId: 'building_power_room',
  }),
  createServicePoint({
    id: 'obstacle_barrier_01',
    name: '南侧路障',
    type: 'barrier',
    point: { x: 20, y: 31 },
    role: '南侧主路的演示路障和视觉提醒',
    aliases: ['南侧路障'],
  }),
]

export const campusScaleRules = {
  roadWidthTiles: 3,
  buildingHeightHint: {
    low: '1 层到 2 层体块感，主要用于设备房和门岗',
    mid: '3 层到 5 层体块感，主要用于公共服务建筑',
    high: '6 层到 8 层体块感，主要用于住宅楼',
  },
  vehicleRelativeSize: '小车宽度约为单车道宽度的三分之一',
}

export function isBlockedPoint(point) {
  return campusZones.some((zone) => !zone.passable && pointInRect(point, zone.rect))
}

export function isRoadPoint(point) {
  return campusRoadCorridors.some((road) => pointInRect(point, road.rect))
}

export function distanceToNearestRoad(point) {
  return Math.min(...campusRoadCorridors.map((road) => distancePointToRect(point, road.rect)))
}

export function isRoadAccessiblePoint(point, maxDistance = 0) {
  return distanceToNearestRoad(point) <= maxDistance
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

export const campusBuildingCatalog = campusZones.filter((zone) => zone.kind !== 'greenbelt')

export const campusDeliveryTargets = campusBuildingCatalog
  .filter((zone) => zone.deliveryPointId)
  .map((zone) => {
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

function normalizePlaceText(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase()
}

// 地点匹配：下一步把“1栋101室、综合楼”转成坐标时，优先复用这套词典。
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
