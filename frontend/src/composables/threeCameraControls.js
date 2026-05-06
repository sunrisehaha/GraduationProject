// 3D 地图相机控制：负责鼠标左键旋转、右键平移、滚轮缩放。
import * as THREE from 'three'
import { campusSceneConfig } from './campusSceneConfig.js'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// 初始化相机控制状态：把默认镜头拆成观察中心、距离、水平角和俯仰角。
export function createCameraControls() {
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

export function applyCameraControls(state) {
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

// 平移观察中心，而不是直接移动相机，保证控制手感稳定。
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

// 左键拖拽旋转：只改变观察角度，不改变观察中心。
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

// 绑定鼠标控制事件，清理函数统一放进 state.cleanupHandlers。
export function bindCameraControls(state, container) {
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
