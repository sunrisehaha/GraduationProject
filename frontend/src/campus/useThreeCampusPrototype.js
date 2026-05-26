// 园区 3D 场景模块：加载 Blender 导出的主场景，再用 Three.js 控制小车、路径和业务标记。
import { nextTick, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { campusSceneConfig, gridPointToWorld } from './campusSceneConfig.js'
import {
  applyCameraControls,
  bindCameraControls,
  createCameraControls,
  updateCameraInertia,
} from './threeCameraControls.js'
import {
  normalizePathPoints,
  syncCartObjects,
  updateCartAnimations,
} from './threeCartMotion.js'
const markerColors = {
  start: '#22c55e',
  end: '#ef4444',
  obstacle: '#f97316',
}

const renderPerformanceConfig = {
  maxPixelRatio: 2,
  antialias: false,
  enableShadows: false,
  shadowMapSize: 1024,
  maxSwayingObjects: 80,
  minInstanceGroupSize: 4,
}

function createState() {
  return {
    container: null,
    scene: null,
    camera: null,
    renderer: null,
    resizeObserver: null,
    resizeFrameId: 0,
    animationFrameId: 0,
    lastFrameTime: 0,
    ambientLight: null,
    sunLight: null,
    sceneRoot: null,
    markerRoot: null,
    cartRoot: null,
    effectRoot: null,
    pathLine: null,
    routeVisualizationSignature: '',
    markerSignature: '',
    lockedRouteOrderId: null,
    assets: {},
    assetsReady: false,
    campusScene: null,
    cartObjects: new Map(),
    swayingObjects: [],
    cleanupHandlers: [],
    interactionState: reactive({
      activeDragMode: null,
    }),
    cameraControls: null,
    currentSceneData: {
      carts: [],
      orders: [],
      currentPath: [],
      demoSpeed: 1,
      dynamicObstacles: [],
    },
  }
}

const routeLockStatuses = new Set(['pending', 'assigned', 'to_pickup', 'delivering'])

function shouldKeepRouteOrder(order) {
  return Boolean(order?.id !== undefined && routeLockStatuses.has(order.status))
}

function pickCurrentOrder(orders, lockedRouteOrderId = null) {
  if (lockedRouteOrderId !== null && lockedRouteOrderId !== undefined) {
    const lockedOrder = orders.find((order) => String(order.id) === String(lockedRouteOrderId))

    if (shouldKeepRouteOrder(lockedOrder)) {
      return lockedOrder
    }
  }

  const latestOrders = orders.slice().reverse()

  return (
    latestOrders.find((order) => order.status === 'delivering') ||
    latestOrders.find((order) => order.status === 'to_pickup') ||
    latestOrders.find((order) => order.status === 'assigned') ||
    latestOrders.find((order) => order.status === 'pending') ||
    null
  )
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

function getStaticInstanceGroupKey(mesh) {
  if (
    !mesh.isMesh ||
    mesh.isSkinnedMesh ||
    !mesh.visible ||
    !mesh.geometry ||
    !mesh.material ||
    Array.isArray(mesh.material) ||
    mesh.material.transparent
  ) {
    return ''
  }

  if (mesh.geometry.morphAttributes && Object.keys(mesh.geometry.morphAttributes).length) {
    return ''
  }

  return `${mesh.geometry.uuid}:${mesh.material.uuid}:${mesh.castShadow ? 1 : 0}:${mesh.receiveShadow ? 1 : 0}`
}

function optimizeStaticMeshInstances(root) {
  root.updateMatrixWorld(true)

  const groups = new Map()
  root.traverse((child) => {
    const key = getStaticInstanceGroupKey(child)
    if (!key) {
      return
    }

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(child)
  })

  const rootWorldInverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const instanceMatrix = new THREE.Matrix4()
  let sourceMeshCount = 0
  let instanceMeshCount = 0

  groups.forEach((meshes) => {
    if (meshes.length < renderPerformanceConfig.minInstanceGroupSize) {
      return
    }

    const source = meshes[0]
    const instancedMesh = new THREE.InstancedMesh(source.geometry, source.material, meshes.length)
    instancedMesh.name = `${source.name || 'static_mesh'}_instances`
    instancedMesh.castShadow = source.castShadow
    instancedMesh.receiveShadow = source.receiveShadow
    instancedMesh.frustumCulled = true
    instancedMesh.matrixAutoUpdate = false
    instancedMesh.layers.mask = source.layers.mask

    meshes.forEach((mesh, index) => {
      instanceMatrix.multiplyMatrices(rootWorldInverse, mesh.matrixWorld)
      instancedMesh.setMatrixAt(index, instanceMatrix)
    })
    instancedMesh.instanceMatrix.needsUpdate = true
    instancedMesh.computeBoundingSphere()
    instancedMesh.computeBoundingBox()

    root.add(instancedMesh)
    meshes.forEach((mesh) => mesh.removeFromParent())

    sourceMeshCount += meshes.length
    instanceMeshCount += 1
  })

  root.userData.instanceOptimization = {
    sourceMeshCount,
    instanceMeshCount,
  }
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

function createBaseScene(state, container) {
  const { camera: cameraConfig } = campusSceneConfig
  state.container = container
  state.cameraControls = createCameraControls()

  state.scene = new THREE.Scene()
  state.scene.background = new THREE.Color('#f3fbff')
  state.scene.fog = null

  state.camera = new THREE.PerspectiveCamera(
    34,
    1,
    cameraConfig.near || 0.1,
    cameraConfig.far || 120
  )
  applyCameraControls(state)

  state.renderer = new THREE.WebGLRenderer({
    antialias: renderPerformanceConfig.antialias,
    alpha: true,
    powerPreference: 'high-performance',
  })
  state.renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, renderPerformanceConfig.maxPixelRatio)
  )
  state.renderer.shadowMap.enabled = renderPerformanceConfig.enableShadows
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap
  state.renderer.outputColorSpace = THREE.SRGBColorSpace
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping
  state.renderer.toneMappingExposure = 1.12
  container.appendChild(state.renderer.domElement)

  state.ambientLight = new THREE.HemisphereLight('#ffffff', '#d3efe5', 2.7)
  state.sunLight = new THREE.DirectionalLight('#fff4d8', 3.2)
  state.sunLight.position.set(-12, 26, 18)
  state.sunLight.castShadow = renderPerformanceConfig.enableShadows
  state.sunLight.shadow.mapSize.set(
    renderPerformanceConfig.shadowMapSize,
    renderPerformanceConfig.shadowMapSize
  )
  state.sunLight.shadow.camera.left = -cameraConfig.shadowExtent
  state.sunLight.shadow.camera.right = cameraConfig.shadowExtent
  state.sunLight.shadow.camera.top = cameraConfig.shadowExtent
  state.sunLight.shadow.camera.bottom = -cameraConfig.shadowExtent

  state.sceneRoot = new THREE.Group()
  state.markerRoot = new THREE.Group()
  state.cartRoot = new THREE.Group()
  state.effectRoot = new THREE.Group()

  state.scene.add(
    state.ambientLight,
    state.sunLight,
    state.sceneRoot,
    state.effectRoot,
    state.markerRoot,
    state.cartRoot
  )

  bindCameraControls(state, container)
}

async function loadAssets(state) {
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/scene/draco/')
  loader.setDRACOLoader(dracoLoader)

  const entries = await Promise.all(
    Object.entries(campusSceneConfig.modelUrls).map(async ([name, url]) => [
      name,
      (await loadGltf(loader, url)).scene,
    ])
  )

  state.assets = Object.fromEntries(entries)
  state.assetsReady = true
  dracoLoader.dispose()
}

function collectSwayTargets(state, root) {
  root.traverse((child) => {
    if (state.swayingObjects.length >= renderPerformanceConfig.maxSwayingObjects) {
      return
    }

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
  campus.position.set(0, 0, 0)
  optimizeStaticMeshInstances(campus)
  markImportedAsset(campus)
  state.sceneRoot.add(campus)
  state.campusScene = campus
  collectSwayTargets(state, campus)
}

const routeHeights = {
  shadow: 0.1,
  main: 0.13,
  current: 0.16,
  node: 0.19,
  arrow: 0.34,
  marker: 0.15,
}

const routeColors = {
  shadow: '#064e3b',
  completed: '#94a3b8',
  current: '#38bdf8',
  remaining: '#22c55e',
  muted: '#64748b',
  node: '#ffffff',
  currentNode: '#3b82f6',
  start: '#22c55e',
  end: '#ef4444',
  arrow: '#a7f3d0',
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function normalizeRoutePoints(rawPoints) {
  const points = normalizePathPoints(Array.isArray(rawPoints) ? rawPoints : [])
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || previous.x !== point.x || previous.y !== point.y
  })
}

function routePointToWorld(point, heightOffset = routeHeights.main) {
  const world = gridPointToWorld(point, campusSceneConfig.groundY + heightOffset)
  return new THREE.Vector3(world.x, world.y, world.z)
}

function calculateRouteLength(worldPoints) {
  return worldPoints.reduce((length, point, index) => {
    if (index === 0) {
      return length
    }

    return length + point.distanceTo(worldPoints[index - 1])
  }, 0)
}

function createRouteMaterial(color, opacity, emissiveIntensity = 0.24) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity,
    roughness: 0.42,
    metalness: 0.04,
    transparent: true,
    opacity,
    depthWrite: false,
  })
}

function createFlatArrowGeometry(width = 0.34, length = 0.62) {
  const geometry = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    0,
    0,
    length * 0.5,
    -width * 0.5,
    0,
    -length * 0.5,
    width * 0.5,
    0,
    -length * 0.5,
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex([0, 1, 2])
  geometry.computeVertexNormals()
  return geometry
}

function createPathTube(worldPoints, options = {}) {
  if (worldPoints.length < 2) {
    return null
  }

  const routeLength = calculateRouteLength(worldPoints)

  if (routeLength <= 0.001) {
    return null
  }

  const curve = new THREE.CatmullRomCurve3(worldPoints, false, 'catmullrom', options.tension ?? 0.08)
  const tubularSegments = clampNumber(
    Math.round(routeLength * (options.segmentDensity || 4)),
    8,
    options.maxSegments || 220
  )
  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    options.radius || 0.08,
    options.radialSegments || 12,
    false
  )
  const material =
    options.material ||
    createRouteMaterial(options.color || routeColors.remaining, options.opacity ?? 0.82)
  const tube = new THREE.Mesh(geometry, material)
  tube.name = options.name || 'route_tube'
  tube.renderOrder = options.renderOrder || 20
  tube.userData.routeMaterial = material
  return tube
}

function createRouteLayer(points, options = {}) {
  const worldPoints = points.map((point) =>
    routePointToWorld(point, options.heightOffset ?? routeHeights.main)
  )
  return createPathTube(worldPoints, options)
}

function distanceToGridSegment(point, start, end) {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY

  if (segmentLengthSquared <= 0.0001) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const projected = clampNumber(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared,
    0,
    1
  )
  const closestX = start.x + segmentX * projected
  const closestY = start.y + segmentY * projected
  return Math.hypot(point.x - closestX, point.y - closestY)
}

function findNearestRouteSegmentIndex(points, cart) {
  if (!cart || !Number.isFinite(cart.x) || !Number.isFinite(cart.y) || points.length < 2) {
    return 0
  }

  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToGridSegment(cart, points[index], points[index + 1])

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  }

  return nearestIndex
}

function resolveRouteProgressIndex(points, cart) {
  if (points.length < 2) {
    return 0
  }

  const serverIndex = Number(cart?.path_index)

  if (Number.isFinite(serverIndex) && serverIndex > 0) {
    return clampNumber(Math.max(0, serverIndex - 1), 0, points.length - 2)
  }

  return findNearestRouteSegmentIndex(points, cart)
}

function findActiveCart(carts, currentOrder, activeCartId) {
  if (activeCartId !== null && activeCartId !== undefined) {
    const matchedCart = carts.find((cart) => String(cart.id) === String(activeCartId))

    if (matchedCart) {
      return matchedCart
    }
  }

  if (currentOrder?.id !== undefined) {
    const orderCart = carts.find((cart) => String(cart.current_order_id) === String(currentOrder.id))

    if (orderCart) {
      return orderCart
    }
  }

  return (
    carts.find(
      (cart) =>
        cart.status !== 'idle' &&
        cart.current_order_id &&
        normalizeRoutePoints(cart.current_path || []).length >= 2
    ) || null
  )
}

function buildActiveRouteData(currentOrder, currentPath, carts, activeCartId) {
  const activeCart = findActiveCart(carts, currentOrder, activeCartId)
  const cartPath = normalizeRoutePoints(activeCart?.current_path || [])
  const orderPath = normalizeRoutePoints(currentOrder?.path || currentOrder?.planned_path || [])
  const fallbackPath = normalizeRoutePoints(currentPath)
  const fullPath =
    cartPath.length >= 2 ? cartPath : orderPath.length >= 2 ? orderPath : fallbackPath

  if (fullPath.length < 2) {
    return null
  }

  const currentIndex = activeCart ? resolveRouteProgressIndex(fullPath, activeCart) : 0
  const completed = currentIndex > 0 ? fullPath.slice(0, currentIndex + 1) : []
  const current = fullPath.slice(currentIndex, Math.min(currentIndex + 2, fullPath.length))
  const remaining =
    currentIndex + 1 < fullPath.length ? fullPath.slice(currentIndex + 1, fullPath.length) : []

  return {
    activeCart,
    activeCartId: activeCart?.id ?? activeCartId ?? null,
    points: fullPath,
    completed,
    current,
    remaining,
    currentIndex,
  }
}

function buildPointSignature(points) {
  return points.map((point) => `${point.x},${point.y}`).join('|')
}

function buildMutedRoutesSignature(carts, activeCartId) {
  return carts
    .map((cart) => {
      if (
        String(cart.id) === String(activeCartId) ||
        cart.status === 'idle' ||
        !cart.current_order_id
      ) {
        return ''
      }

      const cartPath = normalizeRoutePoints(cart.current_path || [])

      if (cartPath.length < 2) {
        return ''
      }

      const startIndex = resolveRouteProgressIndex(cartPath, cart)
      const visiblePath = cartPath.slice(startIndex)

      if (visiblePath.length < 2) {
        return ''
      }

      return [
        cart.id,
        cart.current_order_id,
        cart.status,
        startIndex,
        buildPointSignature(visiblePath),
      ].join(':')
    })
    .filter(Boolean)
    .sort()
    .join('~')
}

function buildRouteVisualizationSignature(routeData, carts) {
  const activeSignature = routeData?.points?.length
    ? [
        'active',
        routeData.activeCartId ?? 'none',
        routeData.currentIndex,
        buildPointSignature(routeData.points),
      ].join(':')
    : 'no-active'
  const mutedSignature = buildMutedRoutesSignature(carts, routeData?.activeCartId)

  return `${activeSignature}::${mutedSignature || 'no-muted'}`
}

function buildMarkerPointSignature(point) {
  if (!point) {
    return 'none'
  }

  return [
    point.id || '',
    Number(point.x),
    Number(point.y),
    getRoutePointLabel(point),
  ].join(':')
}

function buildObstacleSignature(obstacle) {
  if (!obstacle) {
    return 'none'
  }

  const center = getObstacleCenter(obstacle)
  const cellText = (obstacle.cells || [])
    .map((cell) => `${Number(cell.x)},${Number(cell.y)}`)
    .join(';')

  return [
    obstacle.id || '',
    obstacle.block_mode || '',
    obstacle.road_width || '',
    Number(center.x),
    Number(center.y),
    cellText,
  ].join(':')
}

function buildMarkerSignature(currentOrder, dynamicObstacles = []) {
  return [
    currentOrder?.id ?? 'none',
    buildMarkerPointSignature(currentOrder?.start_point),
    buildMarkerPointSignature(currentOrder?.end_point),
    dynamicObstacles.map((obstacle) => buildObstacleSignature(obstacle)).join('|'),
  ].join('>')
}

function createRouteNodes(points, currentIndex) {
  const group = new THREE.Group()
  const material = createGlowMaterial(routeColors.node, 0.86)
  const currentMaterial = createGlowMaterial(routeColors.currentNode, 0.96)
  const startMaterial = createGlowMaterial(routeColors.start, 0.98)
  const endMaterial = createGlowMaterial(routeColors.end, 0.98)
  const maxNodes = 48
  const step = Math.max(1, Math.ceil(points.length / maxNodes))

  points.forEach((point, index) => {
    const isRouteEdge = index === 0 || index === points.length - 1
    const isCurrent = index === currentIndex || index === currentIndex + 1

    if (!isRouteEdge && !isCurrent && index % step !== 0) {
      return
    }

    const colorMaterial =
      index === 0
        ? startMaterial
        : index === points.length - 1
          ? endMaterial
          : isCurrent
            ? currentMaterial
            : material
    const radius = isRouteEdge ? 0.13 : isCurrent ? 0.12 : 0.075
    const node = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), colorMaterial)
    node.position.copy(routePointToWorld(point, routeHeights.node))
    node.name = isCurrent ? 'route_current_node' : 'route_node'
    node.renderOrder = 28
    group.add(node)

    if (isCurrent) {
      group.userData.currentNodes ||= []
      group.userData.currentNodes.push(node)
    }
  })

  return group
}

function createDirectionArrows(points, options = {}) {
  const worldPoints = points.map((point) =>
    routePointToWorld(point, options.heightOffset ?? routeHeights.arrow)
  )

  if (worldPoints.length < 2) {
    return null
  }

  const routeLength = calculateRouteLength(worldPoints)

  if (routeLength <= 0.001) {
    return null
  }

  const group = new THREE.Group()
  const curve = new THREE.CatmullRomCurve3(worldPoints, false, 'catmullrom', 0.08)
  const arrowCount = clampNumber(Math.floor(routeLength / (options.spacing || 3.2)), 1, 18)
  const material = new THREE.MeshBasicMaterial({
    color: options.color || routeColors.arrow,
    transparent: true,
    opacity: options.opacity ?? 0.86,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const geometry = createFlatArrowGeometry(options.width || 0.34, options.length || 0.62)
  const baseDirection = new THREE.Vector3(0, 0, 1)

  for (let index = 1; index <= arrowCount; index += 1) {
    const t = index / (arrowCount + 1)
    const position = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()

    if (tangent.lengthSq() <= 0.0001) {
      continue
    }

    const arrow = new THREE.Mesh(geometry, material)
    arrow.position.copy(position)
    arrow.quaternion.setFromUnitVectors(baseDirection, tangent)
    arrow.name = 'route_direction_arrow'
    arrow.renderOrder = 30
    arrow.userData.phase = index * 0.55
    group.add(arrow)
  }

  group.userData.arrowMaterial = material
  group.userData.routeArrows = group.children
  return group
}

function createMutedCartRoutes(carts, activeCartId) {
  const group = new THREE.Group()

  carts.forEach((cart) => {
    if (String(cart.id) === String(activeCartId) || cart.status === 'idle' || !cart.current_order_id) {
      return
    }

    const cartPath = normalizeRoutePoints(cart.current_path || [])

    if (cartPath.length < 2) {
      return
    }

    const startIndex = resolveRouteProgressIndex(cartPath, cart)
    const visiblePath = cartPath.slice(startIndex)

    if (visiblePath.length < 2) {
      return
    }

    const mutedRoute = createRouteLayer(visiblePath, {
      name: 'muted_cart_route',
      color: routeColors.muted,
      opacity: 0.22,
      emissiveIntensity: 0.08,
      heightOffset: routeHeights.main - 0.015,
      radius: 0.045,
      radialSegments: 8,
      segmentDensity: 2,
      maxSegments: 90,
      renderOrder: 12,
    })

    if (mutedRoute) {
      group.add(mutedRoute)
    }
  })

  return group
}

function createRouteVisualization(routeData, carts) {
  const routeGroup = new THREE.Group()
  routeGroup.name = 'active_route_visualization'
  routeGroup.userData.animatedMaterials = []
  routeGroup.userData.routeArrows = []
  routeGroup.userData.currentNodes = []

  const mutedRoutes = createMutedCartRoutes(carts, routeData?.activeCartId)
  routeGroup.add(mutedRoutes)

  if (!routeData?.points?.length) {
    return routeGroup.children.length ? routeGroup : null
  }

  const shadow = createRouteLayer(routeData.points, {
    name: 'route_shadow_layer',
    color: routeColors.shadow,
    opacity: 0.28,
    emissiveIntensity: 0.02,
    heightOffset: routeHeights.shadow,
    radius: 0.16,
    radialSegments: 12,
    segmentDensity: 3,
    renderOrder: 14,
  })

  if (shadow) {
    routeGroup.add(shadow)
  }

  const completed = createRouteLayer(routeData.completed, {
    name: 'route_completed_layer',
    color: routeColors.completed,
    opacity: 0.5,
    emissiveIntensity: 0.08,
    heightOffset: routeHeights.main,
    radius: 0.07,
    radialSegments: 10,
    renderOrder: 18,
  })

  if (completed) {
    routeGroup.add(completed)
  }

  const remaining = createRouteLayer(routeData.remaining, {
    name: 'route_remaining_layer',
    color: routeColors.remaining,
    opacity: 0.82,
    emissiveIntensity: 0.34,
    heightOffset: routeHeights.main + 0.015,
    radius: 0.095,
    radialSegments: 12,
    renderOrder: 20,
  })

  if (remaining) {
    routeGroup.add(remaining)
    routeGroup.userData.animatedMaterials.push({
      material: remaining.material,
      opacityBase: 0.68,
      opacityWave: 0.12,
      speed: 1.8,
    })
  }

  const currentHalo = createRouteLayer(routeData.current, {
    name: 'route_current_halo',
    color: routeColors.current,
    opacity: 0.24,
    emissiveIntensity: 0.52,
    heightOffset: routeHeights.current + 0.01,
    radius: 0.27,
    radialSegments: 14,
    renderOrder: 22,
  })
  const current = createRouteLayer(routeData.current, {
    name: 'route_current_segment',
    color: routeColors.current,
    opacity: 0.96,
    emissiveIntensity: 0.78,
    heightOffset: routeHeights.current + 0.025,
    radius: 0.15,
    radialSegments: 14,
    renderOrder: 24,
  })

  if (currentHalo) {
    routeGroup.add(currentHalo)
    routeGroup.userData.animatedMaterials.push({
      material: currentHalo.material,
      opacityBase: 0.16,
      opacityWave: 0.14,
      speed: 2.4,
    })
  }

  if (current) {
    routeGroup.add(current)
    routeGroup.userData.animatedMaterials.push({
      material: current.material,
      opacityBase: 0.84,
      opacityWave: 0.14,
      speed: 2.6,
    })
  }

  const nodes = createRouteNodes(routeData.points, routeData.currentIndex)
  routeGroup.add(nodes)
  routeGroup.userData.currentNodes.push(...(nodes.userData.currentNodes || []))

  const arrowPath =
    routeData.currentIndex < routeData.points.length - 1
      ? routeData.points.slice(routeData.currentIndex)
      : routeData.points
  const arrows = createDirectionArrows(arrowPath)

  if (arrows) {
    routeGroup.add(arrows)
    routeGroup.userData.routeArrows.push(...(arrows.userData.routeArrows || []))
    routeGroup.userData.animatedMaterials.push({
      material: arrows.userData.arrowMaterial,
      opacityBase: 0.7,
      opacityWave: 0.26,
      speed: 2.1,
    })
  }

  return routeGroup
}

function createMarkerLabel(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 112
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(255, 255, 255, 0.88)'
  context.strokeStyle = color
  context.lineWidth = 5
  context.roundRect(12, 18, 360, 68, 20)
  context.fill()
  context.stroke()
  context.fillStyle = '#20313d'
  context.font = '700 30px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 192, 52)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  )
  sprite.scale.set(2.7, 0.8, 1)
  sprite.position.y = 1.88
  sprite.userData.labelTexture = texture
  return sprite
}

function getRoutePointLabel(point) {
  return point?.label_text || point?.label || point?.name || point?.id || ''
}

function shortenMarkerLabel(text) {
  if (!text || text.length <= 9) {
    return text
  }

  return `${text.slice(0, 8)}…`
}

function normalizeObstacleCells(obstacle) {
  const cells = Array.isArray(obstacle?.cells) ? obstacle.cells : []
  const normalizedCells = cells
    .filter((cell) => Number.isFinite(Number(cell?.x)) && Number.isFinite(Number(cell?.y)))
    .map((cell) => ({
      x: Number(cell.x),
      y: Number(cell.y),
    }))

  if (normalizedCells.length) {
    return normalizedCells
  }

  if (Number.isFinite(Number(obstacle?.x)) && Number.isFinite(Number(obstacle?.y))) {
    return [{ x: Number(obstacle.x), y: Number(obstacle.y) }]
  }

  return []
}

function getObstacleCenter(obstacle) {
  const centerX = Number(obstacle?.center?.x ?? obstacle?.x)
  const centerY = Number(obstacle?.center?.y ?? obstacle?.y)

  if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
    return { x: centerX, y: centerY }
  }

  const cells = normalizeObstacleCells(obstacle)
  if (!cells.length) {
    return { x: 0, y: 0 }
  }

  return {
    x: cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length,
    y: cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length,
  }
}

function getObstacleLabel(obstacle) {
  if (obstacle?.block_mode === 'full_closure') {
    return '2格路封闭'
  }

  if (obstacle?.block_mode === 'partial_block') {
    return '3格路占道'
  }

  return getRoutePointLabel(obstacle) || '临时施工'
}

function createMarker(point, type) {
  const color = markerColors[type]
  const prefixMap = {
    start: '起点',
    end: '终点',
    obstacle: '障碍',
  }
  const prefix = prefixMap[type] || '标记'
  const pointLabel = shortenMarkerLabel(getRoutePointLabel(point))
  const labelText = pointLabel ? `${prefix} ${pointLabel}` : prefix
  const marker = new THREE.Group()
  const world = gridPointToWorld(point, campusSceneConfig.groundY + routeHeights.marker)
  const isEnd = type === 'end'
  const isObstacle = type === 'obstacle'

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(
      isEnd || isObstacle ? 0.13 : 0.11,
      isEnd || isObstacle ? 0.22 : 0.18,
      isEnd || isObstacle ? 1.34 : 1.08,
      24
    ),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: isEnd || isObstacle ? 0.62 : 0.48,
      roughness: 0.36,
      metalness: 0.1,
    })
  )
  pillar.position.y = isEnd || isObstacle ? 0.74 : 0.61
  pillar.castShadow = true
  pillar.receiveShadow = true
  marker.add(pillar)

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(
      isEnd || isObstacle ? 0.38 : 0.32,
      isEnd || isObstacle ? 0.42 : 0.36,
      0.055,
      40
    ),
    createGlowMaterial(color, isEnd || isObstacle ? 0.62 : 0.5)
  )
  base.position.y = 0.04
  marker.add(base)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      isEnd || isObstacle ? 0.58 : 0.5,
      isEnd || isObstacle ? 0.86 : 0.74,
      64
    ),
    createGlowMaterial(color, isEnd || isObstacle ? 0.74 : 0.66)
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.075
  marker.add(ring)

  const glowColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(
      isEnd || isObstacle ? 0.28 : 0.22,
      isEnd || isObstacle ? 0.42 : 0.34,
      isEnd || isObstacle ? 1.92 : 1.62,
      24,
      1,
      true
    ),
    createGlowMaterial(color, isEnd || isObstacle ? 0.2 : 0.16)
  )
  glowColumn.position.y = isEnd || isObstacle ? 1.0 : 0.86
  marker.add(glowColumn)

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(isEnd || isObstacle ? 0.23 : 0.19, 24, 18),
    createGlowMaterial(color, 0.96)
  )
  orb.position.y = isEnd || isObstacle ? 1.48 : 1.24
  marker.add(orb)

  const pulseParts = [base, pillar, ring, glowColumn, orb]

  if (isObstacle) {
    const warningRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.06, 12, 56),
      createGlowMaterial(color, 0.9)
    )
    warningRing.rotation.x = Math.PI / 2
    warningRing.position.y = 0.12
    marker.add(warningRing)
    pulseParts.push(warningRing)

    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.56, 28),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.28,
        metalness: 0.08,
      })
    )
    beacon.position.y = 1.94
    marker.add(beacon)
    pulseParts.push(beacon)
  }

  marker.add(createMarkerLabel(labelText, color))

  marker.position.set(world.x, world.y, world.z)
  marker.userData.baseY = world.y
  marker.userData.pulseParts = pulseParts

  if (isObstacle) {
    marker.scale.setScalar(1.45)
  }

  return marker
}

function createObstacleCone(color, x, z) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.42,
      roughness: 0.34,
      metalness: 0.06,
    })
  )
  cone.position.set(x, 0.36, z)
  cone.castShadow = true
  cone.receiveShadow = true
  return cone
}

function createObstacleMarker(obstacle) {
  const color = markerColors.obstacle
  const cells = normalizeObstacleCells(obstacle)
  const center = getObstacleCenter(obstacle)
  const world = gridPointToWorld(center, campusSceneConfig.groundY + routeHeights.marker)
  const marker = new THREE.Group()
  const tileSize = campusSceneConfig.tileSize
  const minX = Math.min(...cells.map((cell) => cell.x), center.x)
  const maxX = Math.max(...cells.map((cell) => cell.x), center.x)
  const minY = Math.min(...cells.map((cell) => cell.y), center.y)
  const maxY = Math.max(...cells.map((cell) => cell.y), center.y)
  const width = Math.max(tileSize * 0.86, (maxX - minX + 1) * tileSize * 0.88)
  const depth = Math.max(tileSize * 0.86, (maxY - minY + 1) * tileSize * 0.88)

  const warningArea = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.045, depth),
    createGlowMaterial(color, 0.42)
  )
  warningArea.position.y = 0.04
  marker.add(warningArea)

  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.26, depth),
    new THREE.MeshStandardMaterial({
      color,
      emissive: '#ef4444',
      emissiveIntensity: 0.32,
      roughness: 0.31,
      metalness: 0.08,
      transparent: true,
      opacity: 0.92,
    })
  )
  barrier.position.y = 0.2
  marker.add(barrier)

  const warningRing = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(width, depth) * 0.74, 0.045, 12, 64),
    createGlowMaterial(color, 0.78)
  )
  warningRing.rotation.x = Math.PI / 2
  warningRing.position.y = 0.1
  marker.add(warningRing)

  const coneOffsets =
    width >= depth
      ? [
          [-width * 0.42, 0],
          [0, 0],
          [width * 0.42, 0],
        ]
      : [
          [0, -depth * 0.42],
          [0, 0],
          [0, depth * 0.42],
        ]
  coneOffsets.forEach(([x, z]) => {
    marker.add(createObstacleCone(color, x, z))
  })

  marker.add(createMarkerLabel(`障碍 ${getObstacleLabel(obstacle)}`, color))
  marker.position.set(world.x, world.y, world.z)
  marker.userData.baseY = world.y
  marker.userData.pulseParts = [warningArea, warningRing]
  return marker
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.userData.skipDispose) {
      return
    }

    child.userData.labelTexture?.dispose()
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

function updateSceneData(state) {
  const currentOrder = pickCurrentOrder(
    state.currentSceneData.orders,
    state.lockedRouteOrderId
  )
  state.lockedRouteOrderId = shouldKeepRouteOrder(currentOrder) ? currentOrder.id : null
  const currentPath = normalizePathPoints(state.currentSceneData.currentPath)
  const activeCartId = currentOrder?.assigned_cart_id || null
  const activeRouteData = buildActiveRouteData(
    currentOrder,
    currentPath,
    state.currentSceneData.carts,
    activeCartId
  )
  const visualActiveCartId = activeRouteData?.activeCartId ?? activeCartId

  syncCartObjects(state, state.currentSceneData.carts, visualActiveCartId, {
    createGlowMaterial,
    disposeObject,
    fitToSize,
    markImportedAsset,
  })

  const nextRouteSignature = buildRouteVisualizationSignature(
    activeRouteData,
    state.currentSceneData.carts
  )
  if (nextRouteSignature !== state.routeVisualizationSignature) {
    if (state.pathLine) {
      state.pathLine.removeFromParent()
      disposeObject(state.pathLine)
      state.pathLine = null
    }

    if (activeRouteData || state.currentSceneData.carts.length) {
      state.pathLine = createRouteVisualization(activeRouteData, state.currentSceneData.carts)
      state.pathLine && state.effectRoot.add(state.pathLine)
    }

    state.routeVisualizationSignature = nextRouteSignature
  }

  const startPoint = currentOrder?.start_point
  const endPoint = currentOrder?.end_point
  const dynamicObstacles = state.currentSceneData.dynamicObstacles
  const nextMarkerSignature = buildMarkerSignature(currentOrder, dynamicObstacles)

  if (nextMarkerSignature === state.markerSignature) {
    return
  }

  clearGroup(state.markerRoot)

  if (startPoint) {
    state.markerRoot.add(createMarker(startPoint, 'start'))
  }

  if (endPoint) {
    state.markerRoot.add(createMarker(endPoint, 'end'))
  }

  dynamicObstacles.forEach((obstacle) => {
    state.markerRoot.add(createObstacleMarker(obstacle))
  })

  state.markerSignature = nextMarkerSignature
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

  if (state.pathLine?.userData.animatedMaterials) {
    state.pathLine.userData.animatedMaterials.forEach((entry, index) => {
      const wave = Math.sin(elapsedSeconds * entry.speed + index * 0.45)
      entry.material.opacity = entry.opacityBase + (wave + 1) * 0.5 * entry.opacityWave
    })

    state.pathLine.userData.routeArrows?.forEach((arrow, index) => {
      const wave = Math.sin(elapsedSeconds * 2.8 + arrow.userData.phase + index * 0.2)
      arrow.scale.setScalar(1 + Math.max(0, wave) * 0.18)
    })

    state.pathLine.userData.currentNodes?.forEach((node, index) => {
      const wave = Math.sin(elapsedSeconds * 3 + index * 0.7)
      node.scale.setScalar(1 + Math.max(0, wave) * 0.36)
      node.material.opacity = 0.72 + Math.max(0, wave) * 0.24
    })
  }

  state.markerRoot.children.forEach((marker, index) => {
    const wave = Math.sin(elapsedSeconds * 2.4 + index * 0.8)
    marker.position.y = (marker.userData.baseY ?? campusSceneConfig.groundY) + wave * 0.06

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

    updateCartAnimations(state, delta, state.currentSceneData.demoSpeed)
    updateCameraInertia(state, delta)
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
        demoSpeed: Number.isFinite(Number(value?.demoSpeed)) ? Number(value.demoSpeed) : 1,
        dynamicObstacles: Array.isArray(value?.dynamicObstacles) ? value.dynamicObstacles : [],
      }

      if (state.scene && state.assetsReady) {
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
    updateSceneData(state)
    resizeRenderer(state, container)
    startLoop(state)

    // ResizeObserver 在回调里同步 setSize 容易触发浏览器的 loop 提示，推迟到下一帧处理更稳。
    state.resizeObserver = new ResizeObserver(() => {
      if (state.resizeFrameId) {
        cancelAnimationFrame(state.resizeFrameId)
      }

      state.resizeFrameId = requestAnimationFrame(() => {
        state.resizeFrameId = 0
        resizeRenderer(state, container)
      })
    })
    state.resizeObserver.observe(container)
  })

  onBeforeUnmount(() => {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId)
    }

    state.resizeObserver?.disconnect()
    if (state.resizeFrameId) {
      cancelAnimationFrame(state.resizeFrameId)
    }
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
