// Three.js 园区沙盘渲染模块：后端负责业务数据，前端只负责把地图、小车、路径画出来。
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const gridCols = 40
const gridRows = 35
const tileSize = 0.82
const campusTextureUrl = '/scene/campus-map.png'

const assetUrls = {
  vehicle: '/scene/bruno/vehicle/default.glb',
  birchTree: '/scene/bruno/birchTrees/birchTreesVisual.glb',
  oakTree: '/scene/bruno/oakTrees/oakTreesVisual.glb',
  cherryTree: '/scene/bruno/cherryTrees/cherryTreesVisual.glb',
  terrainModel: '/scene/bruno/terrain/terrain.glb',
  terrainTexture: '/scene/bruno/terrain/terrain.png',
}

const campusHeightBlocks = [
  { x: 8, y: 8.5, width: 4, depth: 7, height: 1.35, body: '#9eb8c5', roof: '#e7eff2' },
  { x: 18.5, y: 7, width: 5, depth: 6, height: 1.65, body: '#a8bdc8', roof: '#edf4f5' },
  { x: 31.5, y: 10, width: 5, depth: 6, height: 1.25, body: '#9fc4bf', roof: '#eaf4ef' },
  { x: 10, y: 25.5, width: 6, depth: 7, height: 1.25, body: '#b7c7c5', roof: '#f0f5f4' },
  { x: 25, y: 24.5, width: 6, depth: 7, height: 1.5, body: '#9fb8c7', roof: '#eef5f6' },
]

const treePlacements = [
  { type: 'birchTree', x: 1.5, y: 6, scale: 0.78 },
  { type: 'oakTree', x: 5, y: 14, scale: 0.92 },
  { type: 'cherryTree', x: 11, y: 1.5, scale: 0.82 },
  { type: 'birchTree', x: 22, y: 2, scale: 0.76 },
  { type: 'oakTree', x: 34, y: 3, scale: 0.9 },
  { type: 'cherryTree', x: 37, y: 14, scale: 0.86 },
  { type: 'birchTree', x: 2, y: 24, scale: 0.74 },
  { type: 'oakTree', x: 15, y: 28, scale: 0.88 },
  { type: 'cherryTree', x: 21, y: 31.5, scale: 0.8 },
  { type: 'birchTree', x: 33, y: 27, scale: 0.76 },
  { type: 'oakTree', x: 38, y: 32, scale: 0.9 },
  { type: 'cherryTree', x: 1, y: 32, scale: 0.82 },
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
  lastFrameTime: 0,
  animatedWheels: [],
  pulseTargets: [],
  cartObjects: new Map(),
  assets: {},
}

// 坐标映射：后端 40 x 35 网格转为 Three.js 世界坐标。
function gridToWorld(point, height = 0) {
  return new THREE.Vector3(
    (point.x - (gridCols - 1) / 2) * tileSize,
    height,
    (point.y - (gridRows - 1) / 2) * tileSize
  )
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

function markImportedAsset(object) {
  object.traverse((child) => {
    child.userData.skipDispose = true
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

// 资源清理：手写几何体要释放；GLB 克隆体共享资源，避免重复 dispose 影响其他实例。
function disposeObject(object) {
  object.traverse((child) => {
    if (child.userData.skipDispose) {
      return
    }

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

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

async function loadSceneAssets() {
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('/scene/bruno/draco/')
  loader.setDRACOLoader(dracoLoader)

  const [vehicle, birchTree, oakTree, cherryTree, terrainModel] = await Promise.all([
    loadGltf(loader, assetUrls.vehicle),
    loadGltf(loader, assetUrls.birchTree),
    loadGltf(loader, assetUrls.oakTree),
    loadGltf(loader, assetUrls.cherryTree),
    loadGltf(loader, assetUrls.terrainModel),
  ])

  sceneState.assets = {
    vehicle: vehicle.scene,
    birchTree: birchTree.scene,
    oakTree: oakTree.scene,
    cherryTree: cherryTree.scene,
    terrainModel: terrainModel.scene,
  }

  dracoLoader.dispose()
}

function fitObjectToFootprint(object, maxWidth, maxDepth) {
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  const scale = Math.min(maxWidth / Math.max(size.x, 0.001), maxDepth / Math.max(size.z, 0.001))
  object.scale.multiplyScalar(scale)
  object.position.sub(center.multiplyScalar(scale))

  const updatedBox = new THREE.Box3().setFromObject(object)
  object.position.y -= updatedBox.min.y
}

// 场景基础：固定斜俯视角，优先保证答辩演示稳定。
function createBaseScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#eaf4f5')
  scene.fog = new THREE.Fog('#eaf4f5', 32, 58)

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120)
  camera.position.set(18, 30, 30)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const ambientLight = new THREE.HemisphereLight('#ffffff', '#c6dce0', 2.5)
  scene.add(ambientLight)

  const mainLight = new THREE.DirectionalLight('#fff8e8', 2.9)
  mainLight.position.set(-14, 24, 16)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.set(2048, 2048)
  mainLight.shadow.camera.left = -24
  mainLight.shadow.camera.right = 24
  mainLight.shadow.camera.top = 24
  mainLight.shadow.camera.bottom = -24
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

function addDecorativeTerrain(group) {
  const terrain = sceneState.assets.terrainModel?.clone(true)

  if (!terrain) {
    return
  }

  markImportedAsset(terrain)
  fitObjectToFootprint(terrain, gridCols * tileSize * 1.04, gridRows * tileSize * 1.04)
  terrain.position.y = -0.1
  terrain.traverse((child) => {
    if (child.isMesh) {
      child.material = child.material.clone()
      child.material.transparent = true
      child.material.opacity = 0.32
    }
  })
  group.add(terrain)
}

function addTrees(group) {
  treePlacements.forEach((item) => {
    const source = sceneState.assets[item.type]

    if (!source) {
      return
    }

    const tree = source.clone(true)
    markImportedAsset(tree)
    fitObjectToFootprint(tree, tileSize * 0.8, tileSize * 0.8)
    tree.scale.multiplyScalar(item.scale)
    const center = gridToWorld({ x: item.x, y: item.y }, 0.02)
    tree.position.x += center.x
    tree.position.z += center.z
    tree.rotation.y = item.x * 0.37 + item.y * 0.19
    group.add(tree)
  })
}

// 静态园区：底图保证业务坐标准确，GLB 资源负责提升空间质感。
function buildStaticCampus(group) {
  clearGroup(group)

  const planeWidth = (gridCols + 1) * tileSize
  const planeDepth = (gridRows + 1) * tileSize
  const geometry = new THREE.PlaneGeometry(planeWidth, planeDepth)
  const material = new THREE.MeshStandardMaterial({
    color: '#edf7f6',
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  const campusPlane = new THREE.Mesh(geometry, material)
  campusPlane.rotation.x = -Math.PI / 2
  campusPlane.position.y = -0.015
  campusPlane.receiveShadow = true
  group.add(campusPlane)

  const textureLoader = new THREE.TextureLoader()
  textureLoader.load(campusTextureUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    material.map = texture
    material.needsUpdate = true
  })

  addDecorativeTerrain(group)

  campusHeightBlocks.forEach((item) => {
    group.add(createCampusHeightBlock(item))
  })

  addTrees(group)
}

function addPath(group, path) {
  if (!path?.length) {
    return
  }

  const points = path.map((point) => gridToWorld(point, 0.2))
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
      new THREE.SphereGeometry(index === 0 ? 0.12 : 0.065, 14, 10),
      nodeMaterial
    )
    node.position.copy(gridToWorld(point, 0.25))
    group.add(node)
    sceneState.pulseTargets.push(node)
  })
}

function createOrderMarker(point, color, height) {
  const group = new THREE.Group()
  const pole = createCylinder(0.022, 0.022, height, createMaterial('#f7fbfc'), 8)
  pole.position.y = height / 2
  group.add(pole)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color }))
  head.position.y = height + 0.12
  group.add(head)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.014, 8, 28),
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
    .slice(-18)
    .forEach((order) => {
      group.add(createOrderMarker(order.start_point, '#34d399', 0.58))
      group.add(createOrderMarker(order.end_point, '#f87171', 0.72))
    })
}

function createFallbackCart(cart) {
  const isIdle = cart.status === 'idle'
  const group = new THREE.Group()
  const body = createBox(0.42, 0.26, 0.56, createMaterial(isIdle ? '#55d8c1' : '#f2a84b'))
  body.position.y = 0.28
  group.add(body)
  return group
}

function createStatusRing(cart) {
  const isIdle = cart.status === 'idle'
  const color = isIdle ? '#55d8c1' : '#f2a84b'
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.025, 8, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 })
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.04
  ring.userData.isStatusRing = true
  return ring
}

function createCart(cart) {
  const group = new THREE.Group()
  const model = sceneState.assets.vehicle ? sceneState.assets.vehicle.clone(true) : createFallbackCart(cart)

  markImportedAsset(model)
  fitObjectToFootprint(model, 0.9, 1.05)
  model.rotation.y = Math.PI
  model.position.y = 0.12
  group.add(model)

  const ring = createStatusRing(cart)
  group.add(ring)

  model.traverse((child) => {
    const name = child.name?.toLowerCase() || ''
    if (name.includes('wheel') || child.geometry?.type === 'CylinderGeometry') {
      child.userData.isWheel = true
    }
  })

  const center = gridToWorld({ x: cart.x, y: cart.y }, 0.08)
  group.position.copy(center)
  group.userData.previousPosition = group.position.clone()
  group.userData.targetPosition = group.position.clone()
  group.userData.targetRotation = group.rotation.y
  group.userData.status = cart.status
  group.userData.cartId = cart.id
  return group
}

function updateCartStatusRing(cartObject, status) {
  const ring = cartObject.children.find((child) => child.userData.isStatusRing)

  if (!ring) {
    return
  }

  const color = status === 'idle' ? '#55d8c1' : '#f2a84b'
  ring.material.color.set(color)
  sceneState.pulseTargets.push(ring)
}

function resolveCartTargetRotation(cart, cartObject, target) {
  const moveX = target.x - cartObject.position.x
  const moveZ = target.z - cartObject.position.z

  if (Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01) {
    return Math.atan2(moveX, moveZ)
  }

  const nextPoint = cart.current_path?.[cart.path_index]
  if (!nextPoint) {
    return cartObject.userData.targetRotation ?? cartObject.rotation.y
  }

  const nextTarget = gridToWorld(nextPoint, 0.08)
  const nextX = nextTarget.x - target.x
  const nextZ = nextTarget.z - target.z

  if (Math.abs(nextX) > 0.01 || Math.abs(nextZ) > 0.01) {
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

    if (!cartObject) {
      cartObject = createCart(cart)
      sceneState.cartObjects.set(cart.id, cartObject)
      sceneState.cartGroup.add(cartObject)
    }

    const target = gridToWorld({ x: cart.x, y: cart.y }, 0.08)
    cartObject.userData.targetPosition = target
    cartObject.userData.status = cart.status
    cartObject.userData.targetRotation = resolveCartTargetRotation(cart, cartObject, target)
    updateCartStatusRing(cartObject, cart.status)
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
      if (child.userData.isWheel) {
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
    const delta = sceneState.lastFrameTime ? Math.min(seconds - sceneState.lastFrameTime, 0.05) : 1 / 60
    sceneState.lastFrameTime = seconds
    const moveEase = 1 - Math.exp(-7.5 * delta)
    const turnEase = 1 - Math.exp(-8.5 * delta)

    sceneState.cartObjects.forEach((cartObject) => {
      const target = cartObject.userData.targetPosition
      const before = cartObject.position.clone()

      if (target) {
        cartObject.position.lerp(target, moveEase)
      }

      const movedDistance = cartObject.position.distanceTo(before)
      cartObject.userData.previousPosition = before

      if (Number.isFinite(cartObject.userData.targetRotation)) {
        cartObject.rotation.y = lerpAngle(cartObject.rotation.y, cartObject.userData.targetRotation, turnEase)
      }

      cartObject.traverse((child) => {
        if (child.userData.isWheel && movedDistance > 0.0001) {
          child.rotation.z += movedDistance * 8
        }
      })
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
    await loadSceneAssets()
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
    sceneState.lastFrameTime = 0
    sceneState.animatedWheels = []
    sceneState.pulseTargets = []
    sceneState.cartObjects = new Map()
    sceneState.assets = {}
  })
}
