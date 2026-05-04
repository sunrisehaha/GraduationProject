// 园区 3D 场景配置：把 Blender 主模型、业务楼栋体系和 Three.js 场景参数收敛到一起。

import { campusBusinessMap, getServicePointById } from './campusBusinessMap.js'

export const campusSceneConfig = {
  gridCols: campusBusinessMap.gridCols,
  gridRows: campusBusinessMap.gridRows,
  tileSize: 0.82,
  groundY: 0.22,
  modelUrls: {
    campus: '/scene/campus/campus.glb',
    vehicle: '/scene/bruno/vehicle/default.glb',
  },
  // 业务锚点：优先展示门岗、快递中心、关键住宅楼、公共服务楼和停车区。
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
      id: 'building_comprehensive',
      label: '综合楼',
      type: 'teaching',
      point: getServicePointById('marker_comprehensive_dropoff').point,
    },
    {
      id: 'building_sports_center',
      label: '运动健身中心',
      type: 'sports',
      point: getServicePointById('marker_sports_center_dropoff').point,
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

// 网格转 Three.js 世界坐标：保持后端 40 x 35 业务坐标和园区模型对齐。
export function gridPointToWorld(point, height = 0) {
  const { gridCols, gridRows, tileSize } = campusSceneConfig

  return {
    x: (point.x - (gridCols - 1) / 2) * tileSize,
    y: height,
    z: (point.y - (gridRows - 1) / 2) * tileSize,
  }
}
