// 园区 3D 场景配置：集中定义主模型资源、网格到世界坐标映射和业务锚点。

export const campusSceneConfig = {
  gridCols: 40,
  gridRows: 35,
  tileSize: 0.82,
  groundY: 0.22,
  modelUrls: {
    campus: '/scene/campus/campus.glb',
    vehicle: '/scene/bruno/vehicle/default.glb',
  },
  // 业务锚点：这些点既是演示语义说明，也是轻量环境动画的落点。
  businessAnchors: [
    { id: 'gate_north', label: '北门岗', type: 'gate', point: { x: 3, y: 3 } },
    { id: 'hub_express_main', label: '快递中心', type: 'hub', point: { x: 8, y: 9 } },
    { id: 'building_teaching_a', label: '教学楼', type: 'teaching', point: { x: 18, y: 8 } },
    { id: 'building_dorm_a', label: '宿舍区 A', type: 'dorm', point: { x: 28, y: 11 } },
    { id: 'building_dorm_b', label: '宿舍区 B', type: 'dorm', point: { x: 24, y: 24 } },
    { id: 'parking_dispatch', label: '调度停车区', type: 'parking', point: { x: 10, y: 28 } },
    { id: 'building_lab_a', label: '实验楼', type: 'lab', point: { x: 32, y: 27 } },
    { id: 'barrier_south', label: '南侧路障', type: 'barrier', point: { x: 19, y: 31 } },
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
