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
  start: '#34d399',
  end: '#f97316',
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
    assetsReady: false,
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
      new THREE.RingGeometry(0.42, 0.6, 56),
      createGlowMaterial(color, 0.5)
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(world.x, world.y + 0.035, world.z)
    state.effectRoot.add(ring)

    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.3, 1.8, 18, 1, true),
      createGlowMaterial(color, 0.12)
    )
    halo.position.set(world.x, world.y + 0.94, world.z)
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
    const world = gridPointToWorld(point, campusSceneConfig.groundY + 0.18)
    return new THREE.Vector3(world.x, world.y, world.z)
  })

  const pathGroup = new THREE.Group()
  const pathSegments = []
  const pathMaterial = new THREE.MeshBasicMaterial({
    color: '#0ea5e9',
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  })
  const glowMaterial = createGlowMaterial('#38bdf8', 0.22)

  for (let index = 0; index < worldPoints.length - 1; index += 1) {
    const start = worldPoints[index]
    const end = worldPoints[index + 1]
    const direction = end.clone().sub(start)
    const length = direction.length()

    if (length <= 0.001) {
      continue
    }

    const center = start.clone().add(end).multiplyScalar(0.5)
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    )

    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, length, 12),
      pathMaterial
    )
    segment.position.copy(center)
    segment.quaternion.copy(rotation)
    segment.name = 'current_task_path_segment'
    pathGroup.add(segment)
    pathSegments.push(segment)

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, length, 12),
      glowMaterial
    )
    glow.position.copy(center)
    glow.quaternion.copy(rotation)
    glow.name = 'current_task_path_glow_segment'
    pathGroup.add(glow)
  }

  worldPoints.forEach((position, index) => {
    if (index % 2 !== 0 && index !== worldPoints.length - 1) {
      return
    }

    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      createGlowMaterial('#7dd3fc', 0.62)
    )
    bead.position.copy(position)
    pathGroup.add(bead)
  })

  pathGroup.userData.pathGlowMaterial = glowMaterial
  pathGroup.userData.pathMaterial = pathMaterial
  pathGroup.userData.pathSegments = pathSegments
  pathGroup.userData.pathBeads = pathGroup.children.filter((child) => !child.name.includes('path_'))
  return pathGroup
}

function createMarkerLabel(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgba(255, 255, 255, 0.88)'
  context.strokeStyle = color
  context.lineWidth = 5
  context.roundRect(10, 16, 236, 58, 18)
  context.fill()
  context.stroke()
  context.fillStyle = '#20313d'
  context.font = '700 28px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 128, 45)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  )
  sprite.scale.set(1.9, 0.72, 1)
  sprite.position.y = 1.95
  sprite.userData.labelTexture = texture
  return sprite
}

function createMarker(point, type) {
  const color = markerColors[type]
  const labelText = type === 'start' ? '取件点' : '配送终点'
  const marker = new THREE.Group()
  const world = gridPointToWorld(point, campusSceneConfig.groundY)

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.18, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.46,
      roughness: 0.36,
      metalness: 0.1,
    })
  )
  pillar.position.y = 0.64
  pillar.castShadow = true
  pillar.receiveShadow = true
  marker.add(pillar)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.74, 56),
    createGlowMaterial(color, 0.72)
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.04
  marker.add(ring)

  const glowColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 1.7, 24, 1, true),
    createGlowMaterial(color, 0.18)
  )
  glowColumn.position.y = 0.92
  marker.add(glowColumn)

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 24, 18),
    createGlowMaterial(color, 0.96)
  )
  orb.position.y = 1.28
  marker.add(orb)

  marker.add(createMarkerLabel(labelText, color))

  marker.position.set(world.x, world.y, world.z)
  marker.userData.pulseParts = [pillar, ring, glowColumn, orb]
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
  const currentOrder = pickCurrentOrder(state.currentSceneData.orders)
  const currentPath = normalizePathPoints(state.currentSceneData.currentPath)
  const activeCartId = currentOrder?.assigned_cart_id || null

  syncCartObjects(state, state.currentSceneData.carts, activeCartId, {
    createGlowMaterial,
    disposeObject,
    fitToSize,
    markImportedAsset,
  })

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

  if (state.pathLine?.userData.pathSegments) {
    const wave = Math.sin(elapsedSeconds * 3.2)
    state.pathLine.userData.pathMaterial.opacity = 0.84 + (wave + 1) * 0.04
    state.pathLine.userData.pathGlowMaterial.opacity = 0.16 + (wave + 1) * 0.05
    state.pathLine.userData.pathBeads.forEach((bead, index) => {
      const beadWave = Math.sin(elapsedSeconds * 4.2 + index * 0.8)
      bead.scale.setScalar(1 + Math.max(0, beadWave) * 0.32)
      bead.material.opacity = 0.42 + Math.max(0, beadWave) * 0.34
    })
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
