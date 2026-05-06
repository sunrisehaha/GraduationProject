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
} from './threeCameraControls.js'
import {
  normalizePathPoints,
  syncCartObjects,
  updateCartAnimations,
} from './threeCartMotion.js'
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
