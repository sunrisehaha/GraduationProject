// Three.js 园区沙盘渲染模块：静态园区使用贴图资产，动态业务层只负责小车、路径和订单点位。
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import * as THREE from 'three'

const gridCols = 20
const gridRows = 12
const tileSize = 1.2
const campusTextureUrl = '/scene/campus-map.png'

const campusHeightBlocks = [
  { x: 5, y: 6, width: 1, depth: 3, height: 1.45, body: '#9eb8c5', roof: '#e7eff2' },
  { x: 12, y: 3.5, width: 1, depth: 2, height: 1.7, body: '#a8bdc8', roof: '#edf4f5' },
  { x: 15.5, y: 8, width: 2, depth: 1, height: 1.25, body: '#9fc4bf', roof: '#eaf4ef' },
  { x: 2, y: 9, width: 1.6, depth: 1, height: 1.05, body: '#b7c7c5', roof: '#f0f5f4' },
]

const sceneState = {
  scene: null,
  camera: null,
  renderer: null,
  staticGroup: null,
  dynamicGroup: null,
  pathGroup: null,
  markerGroup: null,
  cartGroup: null,
  resizeObserver: null,
  animationFrameId: 0,
  animatedWheels: [],
  pulseTargets: [],
  cartObjects: new Map(),
}

// 坐标映射：后端 20 x 12 网格转为 Three.js 世界坐标。
function gridToWorld(point, height = 0) {
  return new THREE.Vector3((point.x - 9.5) * tileSize, height, (point.y - 5.5) * tileSize)
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function lerpAngle(current, target, amount) {
  return current + normalizeAngle(target - current) * amount
}

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

// 资源清理：贴图、材质和几何体都需要释放，避免页面反复进入后占用显存。
function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose()
    }

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (material.map) {
          material.map.dispose()
        }

        material.dispose()
      })
    }
  })
}

function clearGroup(group) {
  if (!group) {
    return
  }

  while (group.children.length) {
    const child = group.children.pop()
    disposeObject(child)
  }
}

// 场景基础：保持固定斜俯视角，让贴图底图和动态标记都容易看清。
function createBaseScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#eaf4f5')

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  camera.position.set(10.5, 12.5, 13.5)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const ambientLight = new THREE.HemisphereLight('#ffffff', '#c6dce0', 2.7)
  scene.add(ambientLight)

  const mainLight = new THREE.DirectionalLight('#fff8e8', 2.8)
  mainLight.position.set(-8, 16, 8)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.set(1024, 1024)
  mainLight.shadow.camera.left = -18
  mainLight.shadow.camera.right = 18
  mainLight.shadow.camera.top = 18
  mainLight.shadow.camera.bottom = -18
  scene.add(mainLight)

  const staticGroup = new THREE.Group()
  const dynamicGroup = new THREE.Group()
  const pathGroup = new THREE.Group()
  const markerGroup = new THREE.Group()
  const cartGroup = new THREE.Group()
  dynamicGroup.add(pathGroup, markerGroup, cartGroup)
  scene.add(staticGroup, dynamicGroup)

  sceneState.scene = scene
  sceneState.camera = camera
  sceneState.renderer = renderer
  sceneState.staticGroup = staticGroup
  sceneState.dynamicGroup = dynamicGroup
  sceneState.pathGroup = pathGroup
  sceneState.markerGroup = markerGroup
  sceneState.cartGroup = cartGroup

  // 后续如果要导入 GLB，只需要替换 buildStaticCampus，不影响动态业务层。
}

function createCampusHeightBlock(item) {
  const group = new THREE.Group()
  const body = createBox(
    item.width * tileSize * 0.78,
    item.height,
    item.depth * tileSize * 0.78,
    createMaterial(item.body)
  )
  body.position.y = item.height / 2
  group.add(body)

  const roof = createBox(
    item.width * tileSize * 0.86,
    0.12,
    item.depth * tileSize * 0.86,
    createMaterial(item.roof)
  )
  roof.position.y = item.height + 0.08
  group.add(roof)

  const center = gridToWorld({ x: item.x, y: item.y }, 0.03)
  group.position.set(center.x, center.y, center.z)
  return group
}

// 静态园区：把确定性生成的园区底图贴到平面上，减少代码建模维护成本。
function buildStaticCampus(group) {
  clearGroup(group)

  const planeWidth = (gridCols + 2) * tileSize
  const planeDepth = (gridRows + 2) * tileSize
  const geometry = new THREE.PlaneGeometry(planeWidth, planeDepth)
  const material = new THREE.MeshBasicMaterial({
    color: '#edf7f6',
    side: THREE.DoubleSide,
  })
  const campusPlane = new THREE.Mesh(geometry, material)
  campusPlane.rotation.x = -Math.PI / 2
  campusPlane.position.y = -0.02
  campusPlane.receiveShadow = true
  group.add(campusPlane)

  const loader = new THREE.TextureLoader()
  loader.load(campusTextureUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    material.map = texture
    material.needsUpdate = true
  })

  // 只叠加少量关键楼体，让答辩时能看出建筑高度，不回到全量代码建模。
  campusHeightBlocks.forEach((item) => {
    group.add(createCampusHeightBlock(item))
  })
}

// 当前路径：只画前端传入的剩余路径，让路线和小车当前位置一致。
function addPath(group, path) {
  if (!path?.length) {
    return
  }

  const points = path.map((point) => gridToWorld(point, 0.18))
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color: '#1fb8e8',
    transparent: true,
    opacity: 0.95,
  })
  const line = new THREE.Line(geometry, material)
  group.add(line)

  const nodeMaterial = new THREE.MeshBasicMaterial({ color: '#7ce8ff' })
  path.forEach((point, index) => {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(index === 0 ? 0.13 : 0.075, 14, 10),
      nodeMaterial
    )
    node.position.copy(gridToWorld(point, 0.23))
    group.add(node)
    sceneState.pulseTargets.push(node)
  })
}

function createOrderMarker(point, color, height) {
  const group = new THREE.Group()
  const pole = createCylinder(0.025, 0.025, height, createMaterial('#f7fbfc'), 8)
  pole.position.y = height / 2
  group.add(pole)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color }))
  head.position.y = height + 0.13
  group.add(head)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.016, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.66 })
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.08
  group.add(ring)
  sceneState.pulseTargets.push(ring)

  const center = gridToWorld(point, 0.08)
  group.position.set(center.x, center.y, center.z)
  return group
}

function addOrderMarkers(group, orders) {
  orders
    .filter((order) => order.status !== 'completed' && order.start_point && order.end_point)
    .forEach((order) => {
      group.add(createOrderMarker(order.start_point, '#34d399', 0.62))
      group.add(createOrderMarker(order.end_point, '#f87171', 0.78))
    })
}

function createCart(cart) {
  const group = new THREE.Group()
  const isIdle = cart.status === 'idle'
  const bodyMaterial = createMaterial(isIdle ? '#55d8c1' : '#f2a84b')
  const darkMaterial = createMaterial('#2a3a42')
  const parcelMaterial = createMaterial('#d8ae74')

  const body = createBox(0.56, 0.32, 0.72, bodyMaterial)
  body.position.y = 0.34
  group.add(body)

  const cabin = createBox(0.34, 0.2, 0.28, createMaterial('#f5fbff'))
  cabin.position.set(0.02, 0.58, 0.08)
  group.add(cabin)

  const parcel = createBox(0.28, 0.24, 0.28, parcelMaterial)
  parcel.position.set(-0.02, 0.66, -0.18)
  group.add(parcel)

  const headLightMaterial = new THREE.MeshBasicMaterial({ color: '#fff3a3' })
  const headLightPositions = [-0.16, 0.16]
  headLightPositions.forEach((x) => {
    const light = createBox(0.1, 0.08, 0.025, headLightMaterial)
    light.position.set(x, 0.42, 0.37)
    group.add(light)
  })

  const wheelPositions = [
    [-0.32, 0.18, -0.28],
    [0.32, 0.18, -0.28],
    [-0.32, 0.18, 0.28],
    [0.32, 0.18, 0.28],
  ]

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), darkMaterial)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, y, z)
    wheel.castShadow = true
    group.add(wheel)
  })

  const center = gridToWorld({ x: cart.x, y: cart.y }, 0.12)
  group.position.copy(center)
  group.userData.targetPosition = group.position.clone()
  group.userData.targetRotation = group.rotation.y
  group.userData.status = cart.status
  group.userData.cartId = cart.id
  return group
}

function resolveCartTargetRotation(cart, cartObject, target) {
  const moveX = target.x - cartObject.position.x
  const moveZ = target.z - cartObject.position.z

  if (Math.abs(moveX) > 0.02 || Math.abs(moveZ) > 0.02) {
    return Math.atan2(moveX, moveZ)
  }

  const nextPoint = cart.current_path?.[cart.path_index]
  if (!nextPoint) {
    return cartObject.userData.targetRotation ?? cartObject.rotation.y
  }

  const nextTarget = gridToWorld(nextPoint, 0.12)
  const nextX = nextTarget.x - target.x
  const nextZ = nextTarget.z - target.z

  if (Math.abs(nextX) > 0.02 || Math.abs(nextZ) > 0.02) {
    return Math.atan2(nextX, nextZ)
  }

  return cartObject.userData.targetRotation ?? cartObject.rotation.y
}

function syncCarts(carts) {
  const activeCartIds = new Set(carts.map((cart) => cart.id))

  sceneState.cartObjects.forEach((cartObject, cartId) => {
    if (activeCartIds.has(cartId)) {
      return
    }

    sceneState.cartGroup.remove(cartObject)
    disposeObject(cartObject)
    sceneState.cartObjects.delete(cartId)
  })

  carts.forEach((cart) => {
    let cartObject = sceneState.cartObjects.get(cart.id)

    if (cartObject?.userData.status !== cart.status) {
      if (cartObject) {
        sceneState.cartGroup.remove(cartObject)
        disposeObject(cartObject)
      }

      cartObject = createCart(cart)
      sceneState.cartObjects.set(cart.id, cartObject)
      sceneState.cartGroup.add(cartObject)
    }

    const target = gridToWorld({ x: cart.x, y: cart.y }, 0.12)
    cartObject.userData.targetPosition = target
    cartObject.userData.status = cart.status
    cartObject.userData.targetRotation = resolveCartTargetRotation(cart, cartObject, target)
  })
}

function updateDynamicObjects(sceneData) {
  sceneState.animatedWheels = []
  sceneState.pulseTargets = []

  clearGroup(sceneState.pathGroup)
  clearGroup(sceneState.markerGroup)
  addPath(sceneState.pathGroup, sceneData.currentPath || [])
  addOrderMarkers(sceneState.markerGroup, sceneData.orders || [])
  syncCarts(sceneData.carts || [])

  sceneState.cartObjects.forEach((cartObject) => {
    cartObject.traverse((child) => {
      if (child.geometry?.type === 'CylinderGeometry') {
        sceneState.animatedWheels.push(child)
      }
    })
  })
}

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

    sceneState.cartObjects.forEach((cartObject) => {
      const target = cartObject.userData.targetPosition

      if (target) {
        cartObject.position.lerp(target, 0.18)
      }

      if (Number.isFinite(cartObject.userData.targetRotation)) {
        cartObject.rotation.y = lerpAngle(cartObject.rotation.y, cartObject.userData.targetRotation, 0.18)
      }
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
    buildStaticCampus(sceneState.staticGroup)
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
    sceneState.pathGroup = null
    sceneState.markerGroup = null
    sceneState.cartGroup = null
    sceneState.resizeObserver = null
    sceneState.animationFrameId = 0
    sceneState.animatedWheels = []
    sceneState.pulseTargets = []
    sceneState.cartObjects = new Map()
  })
}
