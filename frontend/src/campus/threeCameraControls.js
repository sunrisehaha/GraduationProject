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
    yawVelocity: 0,
    pitchVelocity: 0,
    panVelocityX: 0,
    panVelocityZ: 0,
    zoomVelocity: 0,
    lastMoveTime: 0,
    inertiaElapsedSeconds: 0,
    dragIdleSeconds: 0,
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

function getWorldUnitsPerPixel(state) {
  if (!state.container || !state.cameraControls || !state.camera) {
    return 0
  }

  const viewportHeight = Math.max(state.container.clientHeight, 1)
  const cameraFovRadians = THREE.MathUtils.degToRad(state.camera.fov)
  return (2 * Math.tan(cameraFovRadians / 2) * state.cameraControls.distance) / viewportHeight
}

function panCameraByPointer(state, deltaX, deltaY) {
  const worldUnitsPerPixel = getWorldUnitsPerPixel(state)

  if (!worldUnitsPerPixel) {
    return { lateralDistance: 0, forwardDistance: 0 }
  }

  const lateralDistance = -deltaX * worldUnitsPerPixel
  const forwardDistance = deltaY * worldUnitsPerPixel

  panCameraTarget(state, lateralDistance, forwardDistance)
  return { lateralDistance, forwardDistance }
}

function zoomCameraByScale(state, scale) {
  if (!state.cameraControls) {
    return
  }

  const { controls } = campusSceneConfig.camera

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
    return { yawDelta: 0, pitchDelta: 0 }
  }

  const { controls } = campusSceneConfig.camera
  const yawDelta = -deltaX * controls.dragRotateSpeed
  const nextPitch = clamp(
    state.cameraControls.pitch + deltaY * controls.dragPitchSpeed,
    controls.minPitch,
    controls.maxPitch
  )
  const pitchDelta = nextPitch - state.cameraControls.pitch

  state.cameraControls.yaw += yawDelta
  state.cameraControls.pitch = clamp(
    nextPitch,
    controls.minPitch,
    controls.maxPitch
  )

  applyCameraControls(state)
  return { yawDelta, pitchDelta }
}

function clearTinyVelocity(controls) {
  const { minVelocity } = campusSceneConfig.camera.controls

  if (Math.abs(controls.yawVelocity) < minVelocity) {
    controls.yawVelocity = 0
  }

  if (Math.abs(controls.pitchVelocity) < minVelocity) {
    controls.pitchVelocity = 0
  }

  if (Math.abs(controls.panVelocityX) < minVelocity) {
    controls.panVelocityX = 0
  }

  if (Math.abs(controls.panVelocityZ) < minVelocity) {
    controls.panVelocityZ = 0
  }

  if (Math.abs(controls.zoomVelocity) < minVelocity) {
    controls.zoomVelocity = 0
  }
}

function hasCameraVelocity(controls) {
  return (
    controls.yawVelocity ||
    controls.pitchVelocity ||
    controls.panVelocityX ||
    controls.panVelocityZ ||
    controls.zoomVelocity
  )
}

function dampVelocity(value, dampingFactor) {
  return value * dampingFactor
}

// 每帧消耗鼠标输入留下的速度，让旋转、平移和缩放带一点轻微惯性。
export function updateCameraInertia(state, deltaSeconds) {
  const controlsState = state.cameraControls

  if (!controlsState || !state.camera) {
    return
  }

  const { controls } = campusSceneConfig.camera
  const frameScale = Math.min(deltaSeconds * 60, 3)
  const dampingFactor = Math.pow(controls.inertiaDamping, frameScale)
  const canApplyDragInertia =
    !controlsState.isDragging || controlsState.dragIdleSeconds > controls.dragIdleDelaySeconds
  let shouldApplyCamera = false

  if (controlsState.isDragging) {
    controlsState.dragIdleSeconds += deltaSeconds
  } else {
    controlsState.dragIdleSeconds = 0
  }

  if (canApplyDragInertia) {
    controlsState.inertiaElapsedSeconds += deltaSeconds
  } else {
    controlsState.inertiaElapsedSeconds = 0
  }

  if (controlsState.inertiaElapsedSeconds > controls.maxInertiaSeconds) {
    controlsState.yawVelocity = 0
    controlsState.pitchVelocity = 0
    controlsState.panVelocityX = 0
    controlsState.panVelocityZ = 0
  }

  if (canApplyDragInertia) {
    if (controlsState.yawVelocity || controlsState.pitchVelocity) {
      controlsState.yaw += controlsState.yawVelocity * frameScale
      controlsState.pitch = clamp(
        controlsState.pitch + controlsState.pitchVelocity * frameScale,
        controls.minPitch,
        controls.maxPitch
      )
      shouldApplyCamera = true
    }

    if (controlsState.panVelocityX || controlsState.panVelocityZ) {
      panCameraTarget(
        state,
        controlsState.panVelocityX * frameScale,
        controlsState.panVelocityZ * frameScale
      )
      shouldApplyCamera = false
    }
  }

  if (controlsState.zoomVelocity) {
    const zoomScale = 1 + controlsState.zoomVelocity * frameScale
    zoomCameraByScale(state, clamp(zoomScale, 0.82, 1.18))
    shouldApplyCamera = false
  }

  controlsState.yawVelocity = dampVelocity(controlsState.yawVelocity, dampingFactor)
  controlsState.pitchVelocity = dampVelocity(controlsState.pitchVelocity, dampingFactor)
  controlsState.panVelocityX = dampVelocity(controlsState.panVelocityX, dampingFactor)
  controlsState.panVelocityZ = dampVelocity(controlsState.panVelocityZ, dampingFactor)
  controlsState.zoomVelocity = dampVelocity(controlsState.zoomVelocity, dampingFactor)
  clearTinyVelocity(controlsState)

  if (shouldApplyCamera || hasCameraVelocity(controlsState)) {
    clampCameraTarget(controlsState)
    applyCameraControls(state)
  }
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
    state.cameraControls.yawVelocity = 0
    state.cameraControls.pitchVelocity = 0
    state.cameraControls.panVelocityX = 0
    state.cameraControls.panVelocityZ = 0
    state.cameraControls.lastMoveTime = event.timeStamp
    state.cameraControls.inertiaElapsedSeconds = 0
    state.cameraControls.dragIdleSeconds = 0
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
      const { yawDelta, pitchDelta } = rotateCameraByPointer(state, deltaX, deltaY)
      state.cameraControls.yawVelocity = yawDelta * controls.dragVelocityScale
      state.cameraControls.pitchVelocity = pitchDelta * controls.dragVelocityScale
      state.cameraControls.lastMoveTime = event.timeStamp
      state.cameraControls.inertiaElapsedSeconds = 0
      state.cameraControls.dragIdleSeconds = 0
      return
    }

    if (state.cameraControls.dragMode === 'pan') {
      const { lateralDistance, forwardDistance } = panCameraByPointer(state, deltaX, deltaY)
      state.cameraControls.panVelocityX = lateralDistance * controls.dragVelocityScale
      state.cameraControls.panVelocityZ = forwardDistance * controls.dragVelocityScale
      state.cameraControls.lastMoveTime = event.timeStamp
      state.cameraControls.inertiaElapsedSeconds = 0
      state.cameraControls.dragIdleSeconds = 0
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
      if (!controls.mouseEnabled || !state.cameraControls) {
        return
      }

      event.preventDefault()
      const direction = event.deltaY > 0 ? 1 : -1
      state.cameraControls.zoomVelocity += direction * controls.zoomStep * controls.wheelVelocityScale
    },
    { passive: false }
  )
}
