import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 模块布局状态：维护单一模块顺序，并按地图高度自动分配右侧和下方模块。
export function useDashboardModuleLayout({
  moduleDefinitions,
  storageKey,
  storageVersion,
  desktopBreakpoint = 1320,
  moduleGapPx = 12,
}) {
  const defaultModuleOrder = moduleDefinitions.map((module) => module.id)
  const moduleDefinitionMap = Object.fromEntries(moduleDefinitions.map((module) => [module.id, module]))
  const defaultOpenState = Object.fromEntries(
    moduleDefinitions.map((module) => [module.id, module.defaultOpen])
  )

  function normalizeModuleOrder(savedOrder) {
    const validSavedOrder = Array.isArray(savedOrder)
      ? savedOrder.filter((moduleId) => defaultModuleOrder.includes(moduleId))
      : []
    const missingModuleIds = defaultModuleOrder.filter((moduleId) => !validSavedOrder.includes(moduleId))

    return [...validSavedOrder, ...missingModuleIds]
  }

  function normalizeOpenState(savedOpenState) {
    return Object.fromEntries(
      moduleDefinitions.map((module) => [
        module.id,
        typeof savedOpenState?.[module.id] === 'boolean'
          ? savedOpenState[module.id]
          : defaultOpenState[module.id],
      ])
    )
  }

  function getDashboardStorage() {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      return window.localStorage || null
    } catch {
      return null
    }
  }

  function readSavedModuleLayout() {
    const storage = getDashboardStorage()

    if (!storage) {
      return {
        order: defaultModuleOrder,
        openState: defaultOpenState,
      }
    }

    try {
      const savedLayout = JSON.parse(storage.getItem(storageKey) || '{}')

      if (savedLayout.version !== storageVersion) {
        return {
          order: defaultModuleOrder,
          openState: defaultOpenState,
        }
      }

      return {
        order: normalizeModuleOrder(savedLayout.order),
        openState: normalizeOpenState(savedLayout.openState),
      }
    } catch {
      return {
        order: defaultModuleOrder,
        openState: defaultOpenState,
      }
    }
  }

  const savedModuleLayout = readSavedModuleLayout()
  const moduleOrder = ref(savedModuleLayout.order)
  const moduleOpenState = ref(savedModuleLayout.openState)
  const moduleHeights = ref({})
  const mapHeight = ref(0)
  const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
  const draggingModuleId = ref('')
  const mapColumnRef = ref(null)
  const moduleElements = new Map()
  let resizeObserver = null
  let measureFrameId = 0

  const allocatedModuleIds = computed(() => {
    if (viewportWidth.value <= desktopBreakpoint) {
      return {
        side: [],
        overflow: moduleOrder.value,
      }
    }

    const side = []
    const overflow = []
    const availableHeight = mapHeight.value || 900
    let usedHeight = 0
    let hasOverflowed = false

    moduleOrder.value.forEach((moduleId) => {
      const moduleConfig = moduleDefinitionMap[moduleId]
      const fallbackHeight = moduleOpenState.value[moduleId] ? moduleConfig.estimateHeight : 58
      const moduleHeight = Math.ceil(moduleHeights.value[moduleId] || fallbackHeight)
      const nextGap = side.length > 0 ? moduleGapPx : 0

      if (!hasOverflowed && usedHeight + nextGap + moduleHeight <= availableHeight) {
        side.push(moduleId)
        usedHeight += nextGap + moduleHeight
        return
      }

      hasOverflowed = true
      overflow.push(moduleId)
    })

    return {
      side,
      overflow,
    }
  })

  function persistModuleLayout() {
    const storage = getDashboardStorage()

    if (!storage) {
      return
    }

    try {
      storage.setItem(
        storageKey,
        JSON.stringify({
          version: storageVersion,
          order: moduleOrder.value,
          openState: moduleOpenState.value,
        })
      )
    } catch {
      // 本地存储不可用时只放弃记忆布局，不影响看板本身运行。
    }
  }

  function measureDashboardLayout() {
    const mapElement = mapColumnRef.value?.querySelector('.map-section')
    const nextHeights = { ...moduleHeights.value }
    let hasHeightChange = false

    if (mapElement) {
      const nextMapHeight = Math.ceil(mapElement.getBoundingClientRect().height)
      if (nextMapHeight !== mapHeight.value) {
        mapHeight.value = nextMapHeight
      }
    }

    moduleElements.forEach((element, moduleId) => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height)
      if (nextHeights[moduleId] !== nextHeight) {
        nextHeights[moduleId] = nextHeight
        hasHeightChange = true
      }
    })

    if (hasHeightChange) {
      moduleHeights.value = nextHeights
    }
  }

  function scheduleMeasure() {
    if (typeof window === 'undefined') {
      return
    }

    if (measureFrameId) {
      window.cancelAnimationFrame(measureFrameId)
    }

    measureFrameId = window.requestAnimationFrame(() => {
      measureFrameId = 0
      measureDashboardLayout()
    })
  }

  function setModuleElement(moduleId, element) {
    const previousElement = moduleElements.get(moduleId)

    if (!element) {
      if (previousElement) {
        resizeObserver?.unobserve(previousElement)
      }

      moduleElements.delete(moduleId)
      return
    }

    if (previousElement && previousElement !== element) {
      resizeObserver?.unobserve(previousElement)
    }

    moduleElements.set(moduleId, element)

    if (resizeObserver) {
      resizeObserver.observe(element)
    }

    scheduleMeasure()
  }

  function toggleModule(moduleId) {
    moduleOpenState.value = {
      ...moduleOpenState.value,
      [moduleId]: !moduleOpenState.value[moduleId],
    }
  }

  function reorderModule(targetModuleId, shouldInsertAfter) {
    const sourceModuleId = draggingModuleId.value

    if (!sourceModuleId || sourceModuleId === targetModuleId) {
      return
    }

    const nextOrder = moduleOrder.value.filter((moduleId) => moduleId !== sourceModuleId)
    const targetIndex = nextOrder.indexOf(targetModuleId)

    if (targetIndex === -1) {
      return
    }

    nextOrder.splice(targetIndex + (shouldInsertAfter ? 1 : 0), 0, sourceModuleId)
    moduleOrder.value = nextOrder
  }

  function handleModuleDragStart(moduleId, event) {
    draggingModuleId.value = moduleId
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', moduleId)
  }

  function handleModuleDragOver(targetModuleId, event) {
    const targetRect = event.currentTarget.getBoundingClientRect()
    const shouldInsertAfter = event.clientY > targetRect.top + targetRect.height / 2
    reorderModule(targetModuleId, shouldInsertAfter)
  }

  function handleModuleDrop(targetModuleId, event) {
    handleModuleDragOver(targetModuleId, event)
    draggingModuleId.value = ''
  }

  function moveDraggingModuleToEnd() {
    const sourceModuleId = draggingModuleId.value

    if (!sourceModuleId) {
      return
    }

    moduleOrder.value = [...moduleOrder.value.filter((moduleId) => moduleId !== sourceModuleId), sourceModuleId]
    draggingModuleId.value = ''
  }

  function handleWindowResize() {
    viewportWidth.value = window.innerWidth
    scheduleMeasure()
  }

  watch([moduleOrder, moduleOpenState], () => {
    persistModuleLayout()
    nextTick(scheduleMeasure)
  }, { deep: true })

  watch(allocatedModuleIds, () => {
    nextTick(scheduleMeasure)
  })

  onMounted(() => {
    resizeObserver = new ResizeObserver(scheduleMeasure)

    const mapElement = mapColumnRef.value?.querySelector('.map-section')
    if (mapElement) {
      resizeObserver.observe(mapElement)
    }

    moduleElements.forEach((element) => resizeObserver.observe(element))
    window.addEventListener('resize', handleWindowResize)
    nextTick(scheduleMeasure)
  })

  onBeforeUnmount(() => {
    if (measureFrameId) {
      window.cancelAnimationFrame(measureFrameId)
    }

    resizeObserver?.disconnect()
    window.removeEventListener('resize', handleWindowResize)
  })

  return {
    allocatedModuleIds,
    draggingModuleId,
    handleModuleDragOver,
    handleModuleDragStart,
    handleModuleDrop,
    mapColumnRef,
    moduleOpenState,
    moveDraggingModuleToEnd,
    setModuleElement,
    toggleModule,
  }
}
