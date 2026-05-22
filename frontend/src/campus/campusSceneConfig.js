// 园区 3D 场景配置：统一管理更大园区的网格尺寸、镜头参数和关键业务锚点。

import { campusBusinessMap, getServicePointById } from './campusBusinessMap.js'

export const campusSceneConfig = {
  // 静态 Blender 底座和业务世界规则现在同源，都是 100 x 90。
  gridCols: campusBusinessMap.gridCols,
  gridRows: campusBusinessMap.gridRows,
  tileSize: 0.6,
  groundY: 0.22,
  camera: {
    position: { x: 38, y: 54, z: 48 },
    lookAt: { x: 0, y: 0, z: 0 },
    near: 0.1,
    far: 220,
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
    campus: '/scene/campus.glb?v=campus-20260522',
    delivery_bot: '/scene/vehicles/delivery_bot.glb',
  },
  cartModel: {
    asset: 'delivery_bot',
    targetSize: 1.12,
    rotationY: -Math.PI / 2,
  },
  // 业务锚点：只展示关键点位，完整派件目标来自 shared/campus_rules.json。
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
      id: 'west_logistics_center',
      label: '物流中心',
      type: 'hub',
      point: getServicePointById('marker_west_logistics_center_dropoff').point,
    },
    {
      id: 'west_office',
      label: '写字楼',
      type: 'service',
      point: getServicePointById('marker_west_office_dropoff').point,
    },
    {
      id: 'west_property_center',
      label: '物业中心',
      type: 'service',
      point: getServicePointById('marker_west_property_center_dropoff').point,
    },
    {
      id: 'food_japanese_cuisine',
      label: '日本料理',
      type: 'teaching',
      point: getServicePointById('marker_food_japanese_cuisine_dropoff').point,
    },
    {
      id: 'food_booking_lot_restaurant',
      label: '订车场饭店',
      type: 'teaching',
      point: getServicePointById('marker_food_booking_lot_restaurant_dropoff').point,
    },
    {
      id: 'apt_a2',
      label: '东区公寓 A2',
      type: 'dorm',
      point: getServicePointById('marker_apt_a2_dropoff').point,
    },
    {
      id: 'villa_b5',
      label: '东区别墅 B5',
      type: 'dorm',
      point: getServicePointById('marker_villa_b5_dropoff').point,
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

// 网格转 Three.js 世界坐标：业务点和 Blender 静态场景共享 100 x 90 坐标系。
export function gridPointToWorld(point, height = 0) {
  const { gridCols, gridRows, tileSize } = campusSceneConfig

  return {
    x: (point.x - (gridCols - 1) / 2) * tileSize,
    y: height,
    z: (point.y - (gridRows - 1) / 2) * tileSize,
  }
}
