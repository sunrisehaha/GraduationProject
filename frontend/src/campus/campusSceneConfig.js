// 园区 3D 场景配置：统一管理更大园区的网格尺寸、镜头参数和关键业务锚点。

import { campusBusinessMap, getServicePointById } from './campusBusinessMap.js'

const visualGridCols = 100
const visualGridRows = 90

export const campusSceneConfig = {
  // 静态 Blender 底座是 100 x 90；后端业务规则仍是 60 x 45。
  gridCols: visualGridCols,
  gridRows: visualGridRows,
  businessGridCols: campusBusinessMap.gridCols,
  businessGridRows: campusBusinessMap.gridRows,
  tileSize: 0.6,
  groundY: 0.22,
  camera: {
    position: { x: 38, y: 54, z: 48 },
    lookAt: { x: 0, y: 0, z: 0 },
    near: 0.1,
    far: 220,
    fogNear: 56,
    fogFar: 124,
    shadowExtent: 58,
    controls: {
      minDistance: 30,
      maxDistance: 120,
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
      boundsPaddingTiles: 6,
      mouseEnabled: true,
    },
  },
  modelUrls: {
    campus: '/scene/world_rules_static_scene.glb?v=svg-layout-south-facing-20260521c',
    delivery_bot: '/scene/vehicles/delivery_bot.glb',
  },
  cartModel: {
    asset: 'delivery_bot',
    targetSize: 1.12,
    rotationY: -Math.PI / 2,
  },
  treeClusters: [],
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

// 网格转 Three.js 世界坐标：业务点仍来自 60 x 45，先按比例投射到 100 x 90 视觉底座。
// 下一阶段重写 shared/campus_rules.json 后，这里就可以直接使用同源坐标。
export function gridPointToWorld(point, height = 0) {
  const { gridCols, gridRows, businessGridCols, businessGridRows, tileSize } = campusSceneConfig
  const visualX = (point.x / (businessGridCols - 1)) * (gridCols - 1)
  const visualY = (point.y / (businessGridRows - 1)) * (gridRows - 1)

  return {
    x: (visualX - (gridCols - 1) / 2) * tileSize,
    y: height,
    z: (visualY - (gridRows - 1) / 2) * tileSize,
  }
}
