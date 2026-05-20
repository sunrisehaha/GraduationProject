// 3D 小车运动模块：负责小车模型创建、路径同步和连续移动动画。
import * as THREE from 'three'
import { campusSceneConfig, gridPointToWorld } from './campusSceneConfig.js'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function normalizePathPoints(path) {
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

function routeFinishesAtServer(entry, serverPosition) {
  const finalVisualPoint = entry.routePoints[entry.routePoints.length - 1]
  return Boolean(finalVisualPoint && finalVisualPoint.distanceTo(serverPosition) < 0.08)
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

function createVehicleModel(state, helpers) {
  const { asset, targetSize, rotationY } = campusSceneConfig.cartModel
  const source = asset ? state.assets?.[asset] : null

  if (!source || !helpers) {
    return createFallbackVehicle()
  }

  const model = source.clone(true)
  helpers.markImportedAsset(model)
  helpers.fitToSize(model, targetSize)
  model.rotation.y = rotationY
  return model
}

function ensureCartObject(state, cart, helpers) {
  const cached = state.cartObjects.get(cart.id)
  if (cached) {
    return cached
  }

  const model = createVehicleModel(state, helpers)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.04, 10, 52),
    helpers.createGlowMaterial('#5eead4', 0.72)
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.04

  const activeHalo = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.065, 12, 64),
    helpers.createGlowMaterial('#34d399', 0.86)
  )
  activeHalo.rotation.x = Math.PI / 2
  activeHalo.position.y = 0.08
  activeHalo.visible = false

  const statusColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.58, 1.15, 24, 1, true),
    helpers.createGlowMaterial('#34d399', 0.14)
  )
  statusColumn.position.y = 0.7
  statusColumn.visible = false

  const group = new THREE.Group()
  group.add(model, ring, activeHalo, statusColumn)
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
    activeHalo,
    statusColumn,
    wheels,
    lastPosition: new THREE.Vector3(),
    routePathKey: null,
    routePoints: [],
    previousStatus: cart.status,
    pendingVisualCompletion: false,
    initialized: false,
  }
  state.cartObjects.set(cart.id, entry)
  return entry
}

function syncCartRoute(entry, cart, serverPosition) {
  const path = normalizePathPoints(cart.current_path || [])
  const isBusy = cart.status !== 'idle' && cart.current_order_id && path.length >= 2
  const previousStatus = entry.previousStatus

  entry.group.userData.serverPosition = serverPosition

  // 后端可能先完成订单；视觉层要先跑完剩余路径，避免小车半路瞬移到终点。
  if (!isBusy) {
    const shouldFinishVisualRoute = routeFinishesAtServer(entry, serverPosition)

    if (entry.pendingVisualCompletion && entry.routePoints.length > 0 && shouldFinishVisualRoute) {
      entry.previousStatus = cart.status
      return
    }

    if (previousStatus === 'delivering' && entry.routePoints.length > 0 && shouldFinishVisualRoute) {
      entry.pendingVisualCompletion = true
      entry.previousStatus = cart.status
      entry.routePathKey = null
      return
    }

    entry.previousStatus = cart.status
    entry.pendingVisualCompletion = false
    entry.routePathKey = null
    entry.routePoints = []
    entry.group.position.copy(serverPosition)
    entry.lastPosition.copy(serverPosition)
    return
  }

  const pathKey = buildCartPathKey(cart, path)
  const currentIndex = clamp(Math.max(0, (cart.path_index || 0) - 1), 0, path.length - 1)

  entry.previousStatus = cart.status
  entry.pendingVisualCompletion = false

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

export function syncCartObjects(state, carts, activeCartId, helpers) {
  const nextIds = new Set(carts.map((cart) => cart.id))

  state.cartObjects.forEach((entry, cartId) => {
    if (nextIds.has(cartId)) {
      return
    }

    entry.group.removeFromParent()
    helpers.disposeObject(entry.group)
    state.cartObjects.delete(cartId)
  })

  carts.forEach((cart) => {
    const entry = ensureCartObject(state, cart, helpers)
    const nextPosition = gridPointToVector(cart)

    if (!entry.initialized) {
      entry.group.position.copy(nextPosition)
      entry.lastPosition.copy(nextPosition)
      entry.initialized = true
    }

    syncCartRoute(entry, cart, nextPosition)
    entry.group.userData.cartStatus = cart.status
    entry.group.userData.isActive = cart.id === activeCartId
    const isActiveCart = cart.id === activeCartId
    entry.ring.material.color.set(isActiveCart ? '#34d399' : '#60a5fa')
    entry.ring.material.opacity = isActiveCart ? 0.92 : 0.42
    entry.activeHalo.visible = isActiveCart
    entry.statusColumn.visible = isActiveCart
  })
}

export function updateCartAnimations(state, delta) {
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

    if (entry.routePoints.length === 0) {
      entry.pendingVisualCompletion = false
    }

    const movedDistance = entry.group.position.distanceTo(entry.lastPosition)
    if (movedDistance > 0.0005) {
      entry.wheels.forEach((wheel) => {
        wheel.rotation.z += movedDistance * 8
      })
      entry.lastPosition.copy(entry.group.position)
    }

    if (entry.group.userData.isActive) {
      const wave = Math.sin(performance.now() * 0.004)
      const scale = 1 + (wave + 1) * 0.08
      entry.activeHalo.scale.set(scale, scale, scale)
      entry.activeHalo.material.opacity = 0.62 + (wave + 1) * 0.12
      entry.statusColumn.material.opacity = 0.08 + (wave + 1) * 0.05
      return
    }

    entry.activeHalo.scale.setScalar(1)
  })
}
