// Three.js 园区沙盘渲染模块：把订单、小车和路径数据渲染成清爽体块风 3D 场景。
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import * as THREE from 'three'

const gridCols = 20
const gridRows = 12
const tileSize = 1.2

const obstacles = [
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 5, y: 7 },
  { x: 12, y: 3 },
  { x: 12, y: 4 },
]

const roadRows = new Set([2, 6, 9])
const roadCols = new Set([3, 8, 14, 17])

const sceneState = {
  scene: null,
  camera: null,
  renderer: null,
  staticGroup: null,
  dynamicGroup: null,
  resizeObserver: null,
  animationFrameId: 0,
  animatedWheels: [],
  pulseTargets: [],
}

// 坐标映射：后端网格坐标转 Three.js 世界坐标，地图中心落在世界原点。
function gridToWorld(point, height = 0) {
  return new THREE.Vector3((point.x - 9.5) * tileSize, height, (point.y - 5.5) * tileSize)
}

// 地图格子判断：沿用原 2.5D 地图里的道路和障碍物语义。
function isObstacleCell(x, y) {
  return obstacles.some((item) => item.x === x && item.y === y)
}

function isRoadCell(x, y) {
  return roadRows.has(y) || roadCols.has(x) || (x >= 8 && x <= 11 && y >= 4 && y <= 7)
}

// 材质工具：统一打开粗糙材质，保持沙盘体块风而不是写实风。
function createMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.04,
    ...options,
  })
}

function createBox(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createCylinder(radiusTop, radiusBottom, height, material, segments = 16) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// 资源清理：Three.js 不会自动释放 geometry 和 material，组件卸载时需要手动处理。
function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose()
    }

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop()
    disposeObject(child)
  }
}

// 场景基础：创建相机、渲染器和灯光，第一版先使用稳定的固定斜俯视角。
function createBaseScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#eaf4f5')
  scene.fog = new THREE.Fog('#eaf4f5', 24, 42)

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.set(11, 15, 14)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const ambientLight = new THREE.HemisphereLight('#ffffff', '#b5cad0', 2.8)
  scene.add(ambientLight)

  const mainLight = new THREE.DirectionalLight('#fff8e8', 3.2)
  mainLight.position.set(-8, 16, 8)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.set(2048, 2048)
  mainLight.shadow.camera.left = -18
  mainLight.shadow.camera.right = 18
  mainLight.shadow.camera.top = 18
  mainLight.shadow.camera.bottom = -18
  scene.add(mainLight)

  const fillLight = new THREE.DirectionalLight('#bdefff', 1.2)
  fillLight.position.set(10, 8, -10)
  scene.add(fillLight)

  const staticGroup = new THREE.Group()
  const dynamicGroup = new THREE.Group()
  scene.add(staticGroup, dynamicGroup)

  sceneState.scene = scene
  sceneState.camera = camera
  sceneState.renderer = renderer
  sceneState.staticGroup = staticGroup
  sceneState.dynamicGroup = dynamicGroup

  // 后续如果要加旋转控制，可以在这里接入 OrbitControls，并限制最大/最小俯仰角。
}

// 地面与道路：用浅色地块和灰蓝道路建立园区沙盘的基础结构。
function buildGround(group) {
  const groundMaterial = createMaterial('#a8dbaf')
  const roadMaterial = createMaterial('#d9e4e8')
  const roadLineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 })
  const baseMaterial = createMaterial('#8fc9a0')

  const base = createBox(gridCols * tileSize + 1.2, 0.32, gridRows * tileSize + 1.2, baseMaterial)
  base.position.y = -0.2
  group.add(base)

  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      const center = gridToWorld({ x, y }, 0.02)
      const isRoad = isRoadCell(x, y)
      const tile = createBox(tileSize * 0.96, 0.08, tileSize * 0.96, isRoad ? roadMaterial : groundMaterial)
      tile.position.set(center.x, center.y, center.z)
      tile.receiveShadow = true
      group.add(tile)

      if (isRoad && (x + y) % 3 === 0) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(tileSize * 0.36, 0.015, 0.04), roadLineMaterial)
        line.position.set(center.x, 0.085, center.z)
        line.receiveShadow = true
        group.add(line)
      }
    }
  }
}

// 建筑体块：障碍物用楼体表达，说明这些格子不可通行。
function createBuilding(point, levels, colors) {
  const group = new THREE.Group()
  const height = levels * 0.72
  const body = createBox(tileSize * 0.86, height, tileSize * 0.86, createMaterial(colors.body))
  body.position.y = height / 2 + 0.1
  group.add(body)

  const roof = createBox(tileSize * 0.94, 0.16, tileSize * 0.94, createMaterial(colors.roof))
  roof.position.y = height + 0.22
  group.add(roof)

  const windowMaterial = new THREE.MeshBasicMaterial({ color: '#f3fbff', transparent: true, opacity: 0.72 })
  for (let index = 0; index < levels; index += 1) {
    const windowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.025), windowMaterial)
    windowLeft.position.set(-0.2, 0.46 + index * 0.45, -tileSize * 0.44)
    group.add(windowLeft)

    const windowRight = windowLeft.clone()
    windowRight.position.x = 0.2
    group.add(windowRight)
  }

  const center = gridToWorld(point, 0)
  group.position.set(center.x, 0, center.z)
  return group
}

function buildBuildings(group) {
  obstacles.forEach((point, index) => {
    const building = createBuilding(point, 3 + (index % 2), {
      body: index % 2 === 0 ? '#9db7c8' : '#aebfcd',
      roof: index % 2 === 0 ? '#d8e7ef' : '#e5edf1',
    })
    group.add(building)
  })

  const extraBuildings = [
    { x: 15, y: 8, levels: 4, body: '#a7c3cb', roof: '#e7f0f2' },
    { x: 16, y: 8, levels: 3, body: '#97b7c4', roof: '#d8e9ef' },
    { x: 2, y: 9, levels: 3, body: '#b1c6c9', roof: '#eef4f4' },
  ]

  extraBuildings.forEach((item) => {
    group.add(createBuilding(item, item.levels, item))
  })
}

// 绿化点缀：用简单几何体做树，增加沙盘精致感但不引入复杂模型。
function createTree(point) {
  const group = new THREE.Group()
  const trunkMaterial = createMaterial('#9c7656')
  const crownMaterial = createMaterial('#69bb76')
  const trunk = createCylinder(0.07, 0.08, 0.46, trunkMaterial, 10)
  trunk.position.y = 0.28
  group.add(trunk)

  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), crownMaterial)
  crown.position.y = 0.68
  crown.castShadow = true
  group.add(crown)

  const center = gridToWorld(point, 0)
  group.position.set(center.x, 0.08, center.z)
  return group
}

function buildGreenBelts(group) {
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      if (isRoadCell(x, y) || isObstacleCell(x, y) || (x + y) % 4 !== 1) {
        continue
      }

      group.add(createTree({ x, y }))
    }
  }
}

// 园区边界：低矮边框让 3D 沙盘范围更明确。
function buildParkBorder(group) {
  const borderMaterial = createMaterial('#d7e6e8')
  const width = gridCols * tileSize + 1.4
  const depth = gridRows * tileSize + 1.4
  const thickness = 0.14
  const height = 0.26

  const front = createBox(width, height, thickness, borderMaterial)
  front.position.set(0, height / 2, depth / 2)
  const back = front.clone()
  back.position.z = -depth / 2

  const left = createBox(thickness, height, depth, borderMaterial)
  left.position.set(-width / 2, height / 2, 0)
  const right = left.clone()
  right.position.x = width / 2

  group.add(front, back, left, right)
}

function buildStaticPark() {
  clearGroup(sceneState.staticGroup)
  buildGround(sceneState.staticGroup)
  buildBuildings(sceneState.staticGroup)
  buildGreenBelts(sceneState.staticGroup)
  buildParkBorder(sceneState.staticGroup)
}

// 路径线：用 Line + 小节点表达当前调度路径，保持视觉清楚。
function addPath(group, path) {
  if (!path?.length) {
    return
  }

  const points = path.map((point) => gridToWorld(point, 0.34))
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: '#35bff0', transparent: true, opacity: 0.92 })
  const line = new THREE.Line(geometry, material)
  group.add(line)

  const nodeMaterial = new THREE.MeshBasicMaterial({ color: '#79e7ff' })
  path.forEach((point, index) => {
    const node = new THREE.Mesh(new THREE.SphereGeometry(index === 0 ? 0.14 : 0.09, 14, 10), nodeMaterial)
    const center = gridToWorld(point, 0.38)
    node.position.copy(center)
    group.add(node)
    sceneState.pulseTargets.push(node)
  })
}

// 订单标记：未完成订单显示起点和终点，帮助答辩时讲清楚配送链路。
function createOrderMarker(point, color, height) {
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color })
  const poleMaterial = createMaterial('#f7fbfc')

  const pole = createCylinder(0.025, 0.025, height, poleMaterial, 8)
  pole.position.y = height / 2
  group.add(pole)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), material)
  head.position.y = height + 0.14
  group.add(head)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.018, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 })
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.1
  group.add(ring)
  sceneState.pulseTargets.push(ring)

  const center = gridToWorld(point, 0.12)
  group.position.set(center.x, center.y, center.z)
  return group
}

function addOrderMarkers(group, orders) {
  orders
    .filter((order) => order.status !== 'completed' && order.start_point && order.end_point)
    .forEach((order) => {
      group.add(createOrderMarker(order.start_point, '#34d399', 0.72))
      group.add(createOrderMarker(order.end_point, '#f87171', 0.9))
    })
}

// 小车造型：用车身、轮子、包裹组合成可爱的快递小车。
function createCart(cart) {
  const group = new THREE.Group()
  const isIdle = cart.status === 'idle'
  const bodyMaterial = createMaterial(isIdle ? '#55d8c1' : '#f2a84b')
  const darkMaterial = createMaterial('#2a3a42')
  const parcelMaterial = createMaterial('#d8ae74')

  const body = createBox(0.72, 0.32, 0.56, bodyMaterial)
  body.position.y = 0.34
  group.add(body)

  const cabin = createBox(0.34, 0.2, 0.28, createMaterial('#f5fbff'))
  cabin.position.set(0.08, 0.58, -0.02)
  group.add(cabin)

  const parcel = createBox(0.28, 0.24, 0.28, parcelMaterial)
  parcel.position.set(-0.18, 0.66, 0.02)
  group.add(parcel)

  const wheelPositions = [
    [-0.28, 0.18, -0.32],
    [0.28, 0.18, -0.32],
    [-0.28, 0.18, 0.32],
    [0.28, 0.18, 0.32],
  ]

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), darkMaterial)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, y, z)
    wheel.castShadow = true
    group.add(wheel)
    sceneState.animatedWheels.push(wheel)
  })

  const center = gridToWorld({ x: cart.x, y: cart.y }, 0)
  group.position.set(center.x, 0.08, center.z)
  return group
}

function addCarts(group, carts) {
  carts.forEach((cart) => {
    group.add(createCart(cart))
  })
}

function updateDynamicObjects(sceneData) {
  sceneState.animatedWheels = []
  sceneState.pulseTargets = []
  clearGroup(sceneState.dynamicGroup)
  addPath(sceneState.dynamicGroup, sceneData.currentPath || [])
  addOrderMarkers(sceneState.dynamicGroup, sceneData.orders || [])
  addCarts(sceneState.dynamicGroup, sceneData.carts || [])
}

// 响应式尺寸：容器变化时同步更新 renderer 和相机比例，避免画面拉伸。
function resizeRenderer(container) {
  if (!sceneState.renderer || !sceneState.camera) {
    return
  }

  const width = container.clientWidth
  const height = container.clientHeight

  if (!width || !height) {
    return
  }

  sceneState.camera.aspect = width / height
  sceneState.camera.updateProjectionMatrix()
  sceneState.renderer.setSize(width, height, false)
}

function startAnimationLoop() {
  const render = (time) => {
    const seconds = time * 0.001

    sceneState.animatedWheels.forEach((wheel) => {
      wheel.rotation.x = seconds * 4
    })

    sceneState.pulseTargets.forEach((target, index) => {
      const scale = 1 + Math.sin(seconds * 2.2 + index * 0.4) * 0.08
      target.scale.setScalar(scale)
    })

    sceneState.renderer.render(sceneState.scene, sceneState.camera)
    sceneState.animationFrameId = requestAnimationFrame(render)
  }

  sceneState.animationFrameId = requestAnimationFrame(render)
}

export function useThreeMapScene(containerRef, sceneDataRef) {
  onMounted(async () => {
    await nextTick()
    const container = containerRef.value

    if (!container) {
      return
    }

    createBaseScene(container)
    buildStaticPark()
    updateDynamicObjects(sceneDataRef.value || {})
    resizeRenderer(container)
    startAnimationLoop()

    sceneState.resizeObserver = new ResizeObserver(() => resizeRenderer(container))
    sceneState.resizeObserver.observe(container)
  })

  watch(
    sceneDataRef,
    (sceneData) => {
      if (!sceneState.dynamicGroup) {
        return
      }

      updateDynamicObjects(sceneData || {})
    },
    {
      deep: true,
    }
  )

  onBeforeUnmount(() => {
    if (sceneState.animationFrameId) {
      cancelAnimationFrame(sceneState.animationFrameId)
    }

    if (sceneState.resizeObserver) {
      sceneState.resizeObserver.disconnect()
    }

    if (sceneState.staticGroup) {
      clearGroup(sceneState.staticGroup)
    }

    if (sceneState.dynamicGroup) {
      clearGroup(sceneState.dynamicGroup)
    }

    if (sceneState.renderer) {
      sceneState.renderer.dispose()
      sceneState.renderer.domElement.remove()
    }

    sceneState.scene = null
    sceneState.camera = null
    sceneState.renderer = null
    sceneState.staticGroup = null
    sceneState.dynamicGroup = null
    sceneState.resizeObserver = null
    sceneState.animationFrameId = 0
    sceneState.animatedWheels = []
    sceneState.pulseTargets = []
  })
}
