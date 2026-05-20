// 园区 3D 场景配置：统一管理更大园区的网格尺寸、镜头参数和关键业务锚点。

import { campusBusinessMap, getServicePointById } from './campusBusinessMap.js'

export const campusSceneConfig = {
  gridCols: campusBusinessMap.gridCols,
  gridRows: campusBusinessMap.gridRows,
  tileSize: 0.82,
  groundY: 0.22,
  camera: {
    position: { x: 32, y: 38, z: 36 },
    lookAt: { x: 0, y: 0, z: 4 },
    fogNear: 42,
    fogFar: 92,
    shadowExtent: 32,
    controls: {
      minDistance: 24,
      maxDistance: 72,
      zoomStep: 0.12,
      dragRotateSpeed: 0.006,
      dragPitchSpeed: 0.004,
      inertiaDamping: 0.86,
      dragVelocityScale: 0.9,
      wheelVelocityScale: 0.16,
      dragIdleDelaySeconds: 0.04,
      minVelocity: 0.0001,
      maxInertiaSeconds: 0.45,
      minPitch: 0.34,
      maxPitch: 1.14,
      boundsPaddingTiles: 2,
      mouseEnabled: true,
    },
  },
  modelUrls: {
    campus: '/scene/campus/campus.glb?v=building-y-flip-road-rules-20260506',
    pixel_tree: '/scene/environment/pixel_tree.glb',
    realistic_tree: '/scene/environment/realistic_tree.glb',
    delivery_bot: '/scene/vehicles/delivery_bot.glb',
  },
  cartModel: {
    asset: 'delivery_bot',
    targetSize: 1.46,
    rotationY: -Math.PI / 2,
  },
  treeClusters: [
    { asset: 'pixel_tree', point: { x: 23, y: 6 }, targetSize: 5.6, rotation: 0.18 },
    { asset: 'pixel_tree', point: { x: 27, y: 6 }, targetSize: 5.0, rotation: -0.28 },
    { asset: 'pixel_tree', point: { x: 30, y: 7 }, targetSize: 4.8, rotation: 0.32 },
    { asset: 'pixel_tree', point: { x: 34, y: 17 }, targetSize: 4.6, rotation: 0.52 },
    { asset: 'pixel_tree', point: { x: 34, y: 20 }, targetSize: 4.4, rotation: 0.46 },
    { asset: 'pixel_tree', point: { x: 23, y: 28 }, targetSize: 5.8, rotation: -0.14 },
    { asset: 'pixel_tree', point: { x: 27, y: 29 }, targetSize: 4.8, rotation: 0.38 },
    { asset: 'pixel_tree', point: { x: 30, y: 29 }, targetSize: 5.0, rotation: -0.22 },
    { asset: 'pixel_tree', point: { x: 15, y: 18 }, targetSize: 3.4, rotation: 0.26 },
    { asset: 'pixel_tree', point: { x: 15, y: 20 }, targetSize: 3.2, rotation: -0.28 },
    { asset: 'pixel_tree', point: { x: 15, y: 30 }, targetSize: 3.4, rotation: 0.22 },
    { asset: 'pixel_tree', point: { x: 15, y: 32 }, targetSize: 3.6, rotation: -0.18 },
  ],
  // 业务锚点：优先展示门岗、快递中心、住宅区、公共服务区和停车待命区。
  businessAnchors: [
    {
      id: 'gate_north',
      label: '北门岗',
      type: 'gate',
      point: getServicePointById('gate_north').point,
    },
    {
      id: 'hub_dispatch_loading',
      label: '快递装货口',
      type: 'hub',
      point: getServicePointById('hub_dispatch_loading').point,
    },
    {
      id: 'building_residential_1',
      label: '1栋住宅楼',
      type: 'dorm',
      point: getServicePointById('marker_residential_1_dropoff').point,
    },
    {
      id: 'building_residential_8',
      label: '8栋住宅楼',
      type: 'dorm',
      point: getServicePointById('marker_residential_8_dropoff').point,
    },
    {
      id: 'building_resident_service',
      label: '住户服务大楼',
      type: 'service',
      point: getServicePointById('marker_resident_service_dropoff').point,
    },
    {
      id: 'building_property_center',
      label: '物业管理中心',
      type: 'service',
      point: getServicePointById('marker_property_center_dropoff').point,
    },
    {
      id: 'building_sports_center',
      label: '运动健身中心',
      type: 'sports',
      point: getServicePointById('marker_sports_center_dropoff').point,
    },
    {
      id: 'building_comprehensive',
      label: '综合楼',
      type: 'teaching',
      point: getServicePointById('marker_comprehensive_dropoff').point,
    },
    {
      id: 'building_power_room',
      label: '发电间',
      type: 'utility',
      point: getServicePointById('marker_power_room_dropoff').point,
    },
    {
      id: 'hub_dispatch_waiting',
      label: '调度等待区',
      type: 'parking',
      point: getServicePointById('hub_dispatch_waiting').point,
    },
    {
      id: 'gate_south',
      label: '南门岗',
      type: 'gate',
      point: getServicePointById('gate_south').point,
    },
  ],
}

// 网格转 Three.js 世界坐标：保持后端 60 x 45 业务坐标和园区模型对齐。
export function gridPointToWorld(point, height = 0) {
  const { gridCols, gridRows, tileSize } = campusSceneConfig

  return {
    x: (point.x - (gridCols - 1) / 2) * tileSize,
    y: height,
    z: (point.y - (gridRows - 1) / 2) * tileSize,
  }
}
