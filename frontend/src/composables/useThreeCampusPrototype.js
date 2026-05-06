// 园区 3D 场景模块：加载 Blender 导出的主场景，再用 Three.js 控制小车、路径和业务标记。
import { nextTick, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { campusSceneConfig, gridPointToWorld } from './campusSceneConfig.js'
const markerColors = {
  start: '#34d399',
  end: '#fb7185',
}
const anchorColors = {
  gate: '#7dd3fc',
  hub: '#22d3ee',
  teaching: '#60a5fa',
  dorm: '#a78bfa',
  service: '#14b8a6',
  sports: '#f59e0b',
  utility: '#fb7185',
  parking: '#fbbf24',
  lab: '#38bdf8',
  barrier: '#f97316',
}

function createState() {
  return {
    container: null,
    scene: null,
    camera: null,
    renderer: null,
    resizeObserver: null,
    animationFrameId: 0,
    lastFrameTime: 0,
    ambientLight: null,
    sunLight: null,
    sceneRoot: null,
    landscapeRoot: null,
    markerRoot: null,
    cartRoot: null,
    effectRoot: null,
    pathLine: null,
    assets: {},
    campusScene: null,
    cartObjects: new Map(),
    swayingObjects: [],
    pulseObjects: [],
    cleanupHandlers: [],
    interactionState: reactive({
      activeDragMode: null,
    }),
    cameraControls: null,
    currentSceneData: {
      carts: [],
      orders: [],
      currentPath: [],
    },
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// 监控视角控制器：把默认镜头拆成观察中心、距离和水平朝向，后续所有交互都围绕它更新。
function createCameraControls() {
  const { camera, gridCols, gridRows, tileSize } = campusSceneConfig
  const cameraPosition = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z)
  const target = new THREE.Vector3(camera.lookAt.x, camera.lookAt.y, camera.lookAt.z)
  const offset = cameraPosition.clone().sub(target)
  const distance = offset.length()
  const horizontalDistance = Math.max(Math.hypot(offset.x, offset.z), 0.001)
  const padding = camera.controls.boundsPaddingTiles * tileSize
  const halfWidth = ((gridCols - 1) * tileSize) / 2
  const halfDepth = ((gridRows - 1) * tileSize) / 2

  return {
    target,
    defaultTarget: target.clone(),
    distance,
    defaultDistance: distance,
    yaw: Math.atan2(offset.x, offset.z),
    defaultYaw: Math.atan2(offset.x, offset.z),
    pitch: Math.atan2(offset.y, horizontalDistance),
    defaultPitch: Math.atan2(offset.y, horizontalDistance),
    isDragging: false,
    dragMode: null,
    pointerId: null,
    lastPointer: null,
    bounds: {
      minX: -halfWidth + padding,
      maxX: halfWidth - padding,
      minZ: -halfDepth + padding,
      maxZ: halfDepth - padding,
    },
  }
}

function clampCameraTarget(controls) {
  controls.target.x = clamp(controls.target.x, controls.bounds.minX, controls.bounds.maxX)
  controls.target.z = clamp(controls.target.z, controls.bounds.minZ, controls.bounds.maxZ)
}

function applyCameraControls(state) {
  if (!state.camera || !state.cameraControls) {
    return
  }

  const controls = state.cameraControls
  const horizontalDistance = controls.distance * Math.cos(controls.pitch)

  state.camera.position.set(
    controls.target.x + Math.sin(controls.yaw) * horizontalDistance,
    controls.target.y + Math.sin(controls.pitch) * controls.distance,
    controls.target.z + Math.cos(controls.yaw) * horizontalDistance
  )
  state.camera.lookAt(controls.target)
}

function buildPlanarVectors(yaw) {
  return {
    right: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
    forward: new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
  }
}

// 平移逻辑：统一沿当前镜头朝向的平面坐标移动观察中心，而不是直接改相机位置。
function panCameraTarget(state, lateralDistance, forwardDistance) {
  if (!state.cameraControls) {
    return
  }

  const { right, forward } = buildPlanarVectors(state.cameraControls.yaw)
  state.cameraControls.target.addScaledVector(right, lateralDistance)
  state.cameraControls.target.addScaledVector(forward, forwardDistance)
  clampCameraTarget(state.cameraControls)
  applyCameraControls(state)
}

function panCameraByPointer(state, deltaX, deltaY) {
  if (!state.container || !state.cameraControls || !state.camera) {
    return
  }

  const viewportHeight = Math.max(state.container.clientHeight, 1)
  const cameraFovRadians = THREE.MathUtils.degToRad(state.camera.fov)
  const worldUnitsPerPixel =
    (2 * Math.tan(cameraFovRadians / 2) * state.cameraControls.distance) / viewportHeight

  panCameraTarget(state, -deltaX * worldUnitsPerPixel, deltaY * worldUnitsPerPixel)
}

function zoomCamera(state, wheelDeltaY) {
  if (!state.cameraControls) {
    return
  }

  const { controls } = campusSceneConfig.camera
  const scale = wheelDeltaY > 0 ? 1 + controls.zoomStep : 1 / (1 + controls.zoomStep)

  state.cameraControls.distance = clamp(
    state.cameraControls.distance * scale,
    controls.minDistance,
    controls.maxDistance
  )
  applyCameraControls(state)
}

// 旋转逻辑：左键拖拽只改变观察角度，观察中心仍然保持在当前地图位置。
function rotateCameraByPointer(state, deltaX, deltaY) {
  if (!state.cameraControls) {
    return
  }

  const { controls } = campusSceneConfig.camera
  state.cameraControls.yaw -= deltaX * controls.dragRotateSpeed
  state.cameraControls.pitch = clamp(
    state.cameraControls.pitch + deltaY * controls.dragPitchSpeed,
    controls.minPitch,
    controls.maxPitch
  )

  applyCameraControls(state)
}

// 事件绑定：左键旋转、右键平移、滚轮缩放都收敛到地图容器上，组件销毁时一起清理。
function bindCameraControls(state, container) {
  const { controls } = campusSceneConfig.camera

  const register = (target, eventName, handler, options) => {
    target.addEventListener(eventName, handler, options)
    state.cleanupHandlers.push(() => target.removeEventListener(eventName, handler, options))
  }

  const stopDragging = () => {
    if (!state.cameraControls) {
      return
    }

    state.cameraControls.isDragging = false
    state.cameraControls.dragMode = null
    state.cameraControls.pointerId = null
    state.cameraControls.lastPointer = null
    state.interactionState.activeDragMode = null
  }

  register(container, 'pointerdown', (event) => {
    const dragMode = event.button === 0 ? 'rotate' : event.button === 2 ? 'pan' : null

    if (!controls.mouseEnabled || !dragMode || !state.cameraControls) {
      return
    }

    event.preventDefault()
    state.cameraControls.isDragging = true
    state.cameraControls.dragMode = dragMode
    state.cameraControls.pointerId = event.pointerId
    state.cameraControls.lastPointer = {
      x: event.clientX,
      y: event.clientY,
    }
    state.interactionState.activeDragMode = dragMode
    container.setPointerCapture?.(event.pointerId)
  })

  register(container, 'pointermove', (event) => {
    if (
      !controls.mouseEnabled ||
      !state.cameraControls?.isDragging ||
      state.cameraControls.pointerId !== event.pointerId ||
      !state.cameraControls.lastPointer
    ) {
      return
    }

    event.preventDefault()
    const deltaX = event.clientX - state.cameraControls.lastPointer.x
    const deltaY = event.clientY - state.cameraControls.lastPointer.y

    state.cameraControls.lastPointer = {
      x: event.clientX,
      y: event.clientY,
    }

    if (state.cameraControls.dragMode === 'rotate') {
      rotateCameraByPointer(state, deltaX, deltaY)
      return
    }

    if (state.cameraControls.dragMode === 'pan') {
      panCameraByPointer(state, deltaX, deltaY)
    }
  })

  register(container, 'pointerup', (event) => {
    if (state.cameraControls?.pointerId === event.pointerId) {
      stopDragging()
      container.releasePointerCapture?.(event.pointerId)
    }
  })

  register(container, 'pointercancel', () => {
    stopDragging()
  })

  register(container, 'contextmenu', (event) => {
    event.preventDefault()
  })

  register(
    container,
    'wheel',
    (event) => {
      if (!controls.mouseEnabled) {
        return
      }

      event.preventDefault()
      zoomCamera(state, event.deltaY)
    },
    { passive: false }
  )
}

function pickCurrentOrder(orders) {
  const latestOrders = orders.slice().reverse()

  return (
    latestOrders.find((order) => order.status === 'delivering') ||
    latestOrders.find((order) => order.status === 'to_pickup') ||
    latestOrders.find((order) => order.status === 'assigned') ||
    latestOrders.find((order) => order.status === 'pending') ||
    null
  )
}

function createFallbackVehicle() {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.38, 1.7),
    new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.5, metalness: 0.12 })
  )
  body.position.y = 0.38
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.28, 0.82),
    new THREE.MeshStandardMaterial({ color: '#d9f99d', roughness: 0.45, metalness: 0.06 })
  )
  cabin.position.set(0, 0.62, -0.08)
  cabin.castShadow = true
  cabin.receiveShadow = true
  group.add(cabin)

  const wheelGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16)
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.92 })
  const wheelOffsets = [
    [-0.5, 0.18, -0.48],
    [0.5, 0.18, -0.48],
    [-0.5, 0.18, 0.48],
    [0.5, 0.18, 0.48],
  ]

  wheelOffsets.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, y, z)
    wheel.castShadow = true
    wheel.receiveShadow = true
    wheel.userData.isWheel = true
    group.add(wheel)
  })

  return group
}

function createGlowMaterial(color, opacity = 0.68) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  })
}

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

function markImportedAsset(object) {
  object.traverse((child) => {
    child.userData.skipDispose = true

    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

function fitToSize(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  const maxSide = Math.max(size.x, size.y, size.z, 0.001)
  const scale = targetSize / maxSide
  object.scale.multiplyScalar(scale)
  object.position.sub(center.multiplyScalar(scale))

  const updatedBox = new THREE.Box3().setFromObject(object)
  object.position.y -= updatedBox.min.y
}

function normalizePathPoints(path) {
  return path
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => ({
      x: Number(point.x),
      y: Number(point.y),
    }))
}

function gridPointKey(point) {
  return `${point.x},${point.y}`
}

function gridPointToVector(point, height = campusSceneConfig.groundY) {
  const world = gridPointToWorld(point, height)
  return new THREE.Vector3(world.x, world.y, world.z)
}

function buildCartPathKey(cart, path) {
  return `${cart.current_order_id || 'idle'}:${path.map(gridPointKey).join('|')}`
}

function buildRouteVectors(path, startIndex) {
  return path.slice(startIndex).map((point) => gridPointToVector(point))
}

function rotateCartToward(entry, direction, delta) {
  if (direction.lengthSq() <= 0.0001) {
    return
  }

  const targetRotation = Math.atan2(direction.x, direction.z)
  entry.group.rotation.y +=
    Math.atan2(
      Math.sin(targetRotation - entry.group.rotation.y),
      Math.cos(targetRotation - entry.group.rotation.y)
    ) * Math.min(1, delta * 7)
}

function createBaseScene(state, container) {
  const { camera: cameraConfig } = campusSceneConfig
  state.container = container
  state.cameraControls = createCameraControls()

  state.scene = new THREE.Scene()
  state.scene.background = new THREE.Color('#f3fbff')
  state.scene.fog = null

  state.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120)
  applyCameraControls(state)

  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  state.renderer.shadowMap.enabled = true
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap
  state.renderer.outputColorSpace = THREE.SRGBColorSpace
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping
  state.renderer.toneMappingExposure = 1.12
  container.appendChild(state.renderer.domElement)

  state.ambientLight = new THREE.HemisphereLight('#ffffff', '#d3efe5', 2.7)
  state.sunLight = new THREE.DirectionalLight('#fff4d8', 3.2)
  state.sunLight.position.set(-12, 26, 18)
  state.sunLight.castShadow = true
  state.sunLight.shadow.mapSize.set(2048, 2048)
  state.sunLight.shadow.camera.left = -cameraConfig.shadowExtent
  state.sunLight.shadow.camera.right = cameraConfig.shadowExtent
  state.sunLight.shadow.camera.top = cameraConfig.shadowExtent
  state.sunLight.shadow.camera.bottom = -cameraConfig.shadowExtent

  state.sceneRoot = new THREE.Group()
  state.landscapeRoot = new THREE.Group()
  state.markerRoot = new THREE.Group()
  state.cartRoot = new THREE.Group()
  state.effectRoot = new THREE.Group()

  state.scene.add(
    state.ambientLight,
    state.sunLight,
    state.sceneRoot,
    state.landscapeRoot,
    state.effectRoot,
    state.markerRoot,
    state.cartRoot
  )

  bindCameraControls(state, container)
}

async function loadAssets(state) {
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/scene/bruno/draco/')
  loader.setDRACOLoader(dracoLoader)

  const entries = await Promise.all(
    Object.entries(campusSceneConfig.modelUrls).map(async ([name, url]) => [
      name,
      (await loadGltf(loader, url)).scene,
    ])
  )

  state.assets = Object.fromEntries(entries)
  dracoLoader.dispose()
}

function collectSwayTargets(state, root) {
  root.traverse((child) => {
    const name = (child.name || '').toLowerCase()

    if (!child.isObject3D || child.children.length === 0) {
      return
    }

    if (!name.includes('tree') && !name.includes('leaf') && !name.includes('bush')) {
      return
    }

    state.swayingObjects.push({
      object: child,
      baseRotationY: child.rotation.y,
      amplitude: 0.04 + (state.swayingObjects.length % 4) * 0.01,
      speed: 0.55 + (state.swayingObjects.length % 5) * 0.08,
    })
  })
}

function addCampusModel(state) {
  const source = state.assets.campus

  if (!source) {
    return
  }

  const campus = source.clone(true)
  markImportedAsset(campus)
  campus.position.set(0, 0, 0)
  state.sceneRoot.add(campus)
  state.campusScene = campus
  collectSwayTargets(state, campus)
}

function addLandscapeAssets(state) {
  if (!state.landscapeRoot) {
    return
  }

  clearGroup(state.landscapeRoot)

  campusSceneConfig.treeClusters.forEach(({ asset, point, targetSize, rotation = 0 }, index) => {
    const source = state.assets[asset]
    if (!source) {
      return
    }

    const cluster = source.clone(true)
    markImportedAsset(cluster)
    fitToSize(cluster, targetSize)
    cluster.name = `landscape_${asset}_${index + 1}`

    const world = gridPointToWorld(point, campusSceneConfig.groundY)
    cluster.position.set(world.x, world.y, world.z)
    cluster.rotation.y = rotation

    state.landscapeRoot.add(cluster)
    collectSwayTargets(state, cluster)
  })
}

function addAnchorEffects(state) {
  campusSceneConfig.businessAnchors.forEach((anchor, index) => {
    const world = gridPointToWorld(anchor.point, campusSceneConfig.groundY)
    const color = anchorColors[anchor.type] || '#7dd3fc'

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.48, 48),
      createGlowMaterial(color, 0.48)
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(world.x, world.y + 0.02, world.z)
    state.effectRoot.add(ring)

    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.24, 1.5, 16, 1, true),
      createGlowMaterial(color, 0.14)
    )
    halo.position.set(world.x, world.y + 0.78, world.z)
    state.effectRoot.add(halo)

    state.pulseObjects.push({
      object: ring,
      baseScale: 1,
      speed: 1.1 + index * 0.07,
      intensity: 0.18,
      opacityBase: 0.28,
      opacityWave: 0.24,
    })

    state.pulseObjects.push({
      object: halo,
      baseScale: 1,
      speed: 0.85 + index * 0.05,
      intensity: 0.08,
      opacityBase: 0.08,
      opacityWave: 0.08,
    })
  })
}

function createPathLine(points) {
  if (points.length < 2) {
    return null
  }

  const worldPoints = points.map((point) => {
    const world = gridPointToWorld(point, campusSceneConfig.groundY + 0.06)
    return new THREE.Vector3(world.x, world.y, world.z)
  })

  const geometry = new THREE.BufferGeometry().setFromPoints(worldPoints)
  const material = new THREE.LineDashedMaterial({
    color: '#38bdf8',
    dashSize: 0.34,
    gapSize: 0.16,
    transparent: true,
    opacity: 0.94,
  })
  const line = new THREE.Line(geometry, material)
  line.computeLineDistances()
  return line
}

function createMarker(point, type) {
  const color = markerColors[type]
  const marker = new THREE.Group()
  const world = gridPointToWorld(point, campusSceneConfig.groundY)

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.86, 18),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.12,
    })
  )
  pillar.position.y = 0.47
  pillar.castShadow = true
  pillar.receiveShadow = true
  marker.add(pillar)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.42, 36),
    createGlowMaterial(color, 0.62)
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  marker.add(ring)

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 16),
    createGlowMaterial(color, 0.95)
  )
  orb.position.y = 0.93
  marker.add(orb)

  marker.position.set(world.x, world.y, world.z)
  marker.userData.pulseParts = [pillar, ring, orb]
  return marker
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.userData.skipDispose) {
      return
    }

    child.geometry?.dispose()

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

function createVehicleModel(state) {
  const source = state.assets.vehicle

  if (!source) {
    return createFallbackVehicle()
  }

  const clone = source.clone(true)
  markImportedAsset(clone)
  fitToSize(clone, 1.45)
  clone.rotation.y = Math.PI
  return clone
}

function ensureCartObject(state, cart) {
  const cached = state.cartObjects.get(cart.id)
  if (cached) {
    return cached
  }

  const model = createVehicleModel(state)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.04, 10, 52),
    createGlowMaterial('#5eead4', 0.72)
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.04

  const group = new THREE.Group()
  group.add(model, ring)
  state.cartRoot.add(group)

  const wheels = []
  group.traverse((child) => {
    const name = (child.name || '').toLowerCase()
    if (child.userData.isWheel || name.includes('wheel')) {
      wheels.push(child)
    }
  })

  const entry = {
    group,
    ring,
    wheels,
    lastPosition: new THREE.Vector3(),
    routePathKey: null,
    routePoints: [],
    initialized: false,
  }
  state.cartObjects.set(cart.id, entry)
  return entry
}

function syncCartRoute(entry, cart, serverPosition) {
  const path = normalizePathPoints(cart.current_path || [])
  const isBusy = cart.status !== 'idle' && cart.current_order_id && path.length >= 2

  entry.group.userData.serverPosition = serverPosition

  // 空闲车没有任务时必须立即停止动画；重置演示时不能继续补跑旧路径。
  if (!isBusy) {
    entry.routePathKey = null
    entry.routePoints = []
    entry.group.position.copy(serverPosition)
    entry.lastPosition.copy(serverPosition)
    return
  }

  const pathKey = buildCartPathKey(cart, path)
  const currentIndex = clamp(Math.max(0, (cart.path_index || 0) - 1), 0, path.length - 1)

  if (entry.routePathKey === pathKey) {
    const isCloseToServerPosition =
      entry.group.position.distanceTo(serverPosition) < campusSceneConfig.tileSize * 0.65

    if (entry.routePoints.length === 0 && currentIndex < path.length - 1 && isCloseToServerPosition) {
      entry.routePoints = buildRouteVectors(path, currentIndex + 1)
    }
    return
  }

  entry.routePathKey = pathKey
  entry.routePoints = buildRouteVectors(path, currentIndex + 1)

  // 页面中途刷新时直接从服务端当前格开始；避免旧视觉位置跨区域追新路径。
  if (entry.group.position.distanceTo(serverPosition) > campusSceneConfig.tileSize * 2) {
    entry.group.position.copy(serverPosition)
    entry.lastPosition.copy(serverPosition)
  }
}

function syncCartObjects(state, carts, activeCartId) {
  const nextIds = new Set(carts.map((cart) => cart.id))

  state.cartObjects.forEach((entry, cartId) => {
    if (nextIds.has(cartId)) {
      return
    }

    entry.group.removeFromParent()
    disposeObject(entry.group)
    state.cartObjects.delete(cartId)
  })

  carts.forEach((cart) => {
    const entry = ensureCartObject(state, cart)
    const nextPosition = gridPointToVector(cart)

    if (!entry.initialized) {
      entry.group.position.copy(nextPosition)
      entry.lastPosition.copy(nextPosition)
      entry.initialized = true
    }

    syncCartRoute(entry, cart, nextPosition)
    entry.group.userData.cartStatus = cart.status
    entry.group.userData.isActive = cart.id === activeCartId
    entry.ring.material.color.set(cart.id === activeCartId ? '#34d399' : '#60a5fa')
    entry.ring.material.opacity = cart.id === activeCartId ? 0.82 : 0.42
  })
}

function updateSceneData(state) {
  const currentOrder = pickCurrentOrder(state.currentSceneData.orders)
  const currentPath = normalizePathPoints(state.currentSceneData.currentPath)
  const activeCartId = currentOrder?.assigned_cart_id || null

  syncCartObjects(state, state.currentSceneData.carts, activeCartId)

  if (state.pathLine) {
    state.pathLine.removeFromParent()
    disposeObject(state.pathLine)
    state.pathLine = null
  }

  clearGroup(state.markerRoot)

  if (currentPath.length >= 2) {
    state.pathLine = createPathLine(currentPath)
    state.pathLine && state.effectRoot.add(state.pathLine)
  }

  const startPoint = currentOrder?.start_point
  const endPoint = currentOrder?.end_point

  if (startPoint) {
    state.markerRoot.add(createMarker(startPoint, 'start'))
  }

  if (endPoint) {
    state.markerRoot.add(createMarker(endPoint, 'end'))
  }
}

function resizeRenderer(state, container) {
  const width = container.clientWidth
  const height = container.clientHeight

  if (!width || !height) {
    return
  }

  state.camera.aspect = width / height
  state.camera.updateProjectionMatrix()
  state.renderer.setSize(width, height, false)
}

function updateCartAnimations(state, delta) {
  state.cartObjects.forEach((entry) => {
    // 小车按完整路径队列匀速前进，避免直接追服务端整数坐标造成跳格和斜穿。
    let remainingDistance = campusSceneConfig.tileSize * 1.25 * delta

    while (remainingDistance > 0 && entry.routePoints.length > 0) {
      const targetPosition = entry.routePoints[0]
      const movement = targetPosition.clone().sub(entry.group.position)
      const distance = movement.length()

      if (distance <= 0.01) {
        entry.group.position.copy(targetPosition)
        entry.routePoints.shift()
        continue
      }

      const travelDistance = Math.min(distance, remainingDistance)
      const direction = movement.normalize()
      entry.group.position.addScaledVector(direction, travelDistance)
      rotateCartToward(entry, direction, delta)

      remainingDistance -= travelDistance

      if (travelDistance >= distance - 0.01) {
        entry.group.position.copy(targetPosition)
        entry.routePoints.shift()
      }
    }

    const movedDistance = entry.group.position.distanceTo(entry.lastPosition)
    if (movedDistance > 0.0005) {
      entry.wheels.forEach((wheel) => {
        wheel.rotation.z += movedDistance * 8
      })
      entry.lastPosition.copy(entry.group.position)
    }
  })
}

function updateEnvironmentalAnimations(state, elapsedSeconds) {
  if (state.sunLight) {
    state.sunLight.intensity = 2.8 + Math.sin(elapsedSeconds * 0.6) * 0.15
  }

  if (state.ambientLight) {
    state.ambientLight.intensity = 2.35 + Math.sin(elapsedSeconds * 0.45) * 0.08
  }

  state.swayingObjects.forEach((entry, index) => {
    entry.object.rotation.y =
      entry.baseRotationY + Math.sin(elapsedSeconds * entry.speed + index * 0.6) * entry.amplitude
  })

  state.pulseObjects.forEach((entry, index) => {
    const wave = Math.sin(elapsedSeconds * entry.speed + index * 0.5)
    const scale = entry.baseScale + wave * entry.intensity
    entry.object.scale.setScalar(scale)

    if (entry.object.material) {
      entry.object.material.opacity = entry.opacityBase + (wave + 1) * 0.5 * entry.opacityWave
    }
  })

  if (state.pathLine?.material) {
    state.pathLine.material.dashOffset = -elapsedSeconds * 1.6
    state.pathLine.material.opacity = 0.74 + Math.sin(elapsedSeconds * 3.2) * 0.1
  }

  state.markerRoot.children.forEach((marker, index) => {
    const wave = Math.sin(elapsedSeconds * 2.4 + index * 0.8)
    marker.position.y = campusSceneConfig.groundY + wave * 0.06

    marker.userData.pulseParts?.forEach((part, partIndex) => {
      part.scale.setScalar(1 + Math.max(0, wave) * 0.08 * (partIndex + 1))
      if (part.material?.opacity) {
        part.material.opacity = 0.48 + Math.max(0, wave) * 0.36
      }
    })
  })
}

function startLoop(state) {
  const render = (time) => {
    const seconds = time * 0.001
    const delta = state.lastFrameTime ? Math.min(seconds - state.lastFrameTime, 0.05) : 1 / 60
    state.lastFrameTime = seconds

    updateCartAnimations(state, delta)
    updateEnvironmentalAnimations(state, seconds)
    state.renderer.render(state.scene, state.camera)
    state.animationFrameId = requestAnimationFrame(render)
  }

  state.animationFrameId = requestAnimationFrame(render)
}

export function useThreeCampusPrototype(containerRef, sceneData) {
  const state = createState()

  watch(
    sceneData,
    (value) => {
      state.currentSceneData = {
        carts: Array.isArray(value?.carts) ? value.carts : [],
        orders: Array.isArray(value?.orders) ? value.orders : [],
        currentPath: Array.isArray(value?.currentPath) ? value.currentPath : [],
      }

      if (state.scene) {
        updateSceneData(state)
      }
    },
    { immediate: true, deep: true }
  )

  onMounted(async () => {
    await nextTick()
    const container = containerRef.value

    if (!container) {
      return
    }

    createBaseScene(state, container)
    await loadAssets(state)
    addCampusModel(state)
    addLandscapeAssets(state)
    addAnchorEffects(state)
    updateSceneData(state)
    resizeRenderer(state, container)
    startLoop(state)

    state.resizeObserver = new ResizeObserver(() => resizeRenderer(state, container))
    state.resizeObserver.observe(container)
  })

  onBeforeUnmount(() => {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId)
    }

    state.resizeObserver?.disconnect()
    state.cleanupHandlers.forEach((cleanup) => cleanup())
    state.cleanupHandlers = []

    state.cartObjects.forEach((entry) => {
      entry.group.removeFromParent()
      disposeObject(entry.group)
    })
    state.cartObjects.clear()

    if (state.scene) {
      while (state.scene.children.length) {
        const child = state.scene.children.pop()
        disposeObject(child)
      }
    }

    state.renderer?.dispose()
    state.renderer?.domElement.remove()
  })

  return {
    interactionState: state.interactionState,
  }
}
