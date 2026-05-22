<script setup>
// 地图组件：接收当前任务、小车和订单数据，然后交给 Three.js 场景模块绘制。
import { computed, ref } from 'vue'
import { useThreeCampusPrototype } from '../../../campus/useThreeCampusPrototype'

const props = defineProps({
  mapInfo: {
    type: Object,
    required: true,
  },
  currentTask: {
    type: Object,
    required: true,
  },
  currentPath: {
    type: Array,
    required: true,
  },
  carts: {
    type: Array,
    required: true,
  },
  orders: {
    type: Array,
    required: true,
  },
  demoSpeed: {
    type: Number,
    default: 1,
  },
})

const sceneRef = ref(null)

// 地图场景数据：把业务数据整理成渲染模块所需的最小输入
const sceneData = computed(() => ({
  carts: props.carts,
  orders: props.orders,
  currentPath: props.currentPath,
  demoSpeed: props.demoSpeed,
}))

// 3D 场景接收实时业务数据，用于突出当前任务、路径和小车位置。
const { interactionState } = useThreeCampusPrototype(sceneRef, sceneData)
</script>

<template>
  <section class="map-section panel-card">
    <div class="panel-card__header">
      <div class="map-title-block">
        <span class="map-title-block__icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <path class="map-icon__side-left" d="M7.5 29.2v3.4l19.6 7.6v-3.3z" />
            <path class="map-icon__side-right" d="M27.1 36.9v3.3l13.4-9.1v-3.4z" />
            <path class="map-icon__surface" d="M7.5 29.2l14.2-9.2l18.8 7.7l-13.4 9.2z" />
            <path class="map-icon__grid" d="M13.6 25.3l19 7.5" />
            <path class="map-icon__grid" d="M19.3 21.5l18.8 7.5" />
            <path class="map-icon__grid" d="M15.2 32.2l13.8-9.2" />
            <path class="map-icon__route-shadow" d="M18 31.4c4.6 2 5.7-4.9 10-3.4c3.2 1.1 2.2 5.1-2.4 5.7" />
            <path class="map-icon__route" d="M18 31.4c4.6 2 5.7-4.9 10-3.4c3.2 1.1 2.2 5.1-2.4 5.7" />
            <circle class="map-icon__start" cx="18" cy="31.4" r="2.2" />
            <path class="map-icon__pin" d="M30.8 13.5a4.9 4.9 0 0 1 4.9 4.9c0 3.8-4.9 8.1-4.9 8.1s-4.9-4.3-4.9-8.1a4.9 4.9 0 0 1 4.9-4.9z" />
            <circle class="map-icon__pin-dot" cx="30.8" cy="18.4" r="1.55" />
          </svg>
        </span>
        <span class="map-title-block__text">
          <h2>智慧园区 3D 沙盘</h2>
        </span>
      </div>
      <p class="panel-card__desc">{{ mapInfo.summary }}</p>
    </div>

    <div class="canvas-wrap">
      <div
        ref="sceneRef"
        class="park-three-scene"
        :class="{ 'park-three-scene--active': interactionState.activeDragMode }"
        aria-label="园区三维地图"
      ></div>

      <div class="map-overlay">
        <p class="map-overlay__title">当前任务：{{ currentTask.id }}</p>
        <p>业务单号：{{ currentTask.orderNo }}</p>
        <p>订单状态：{{ currentTask.status }}</p>
        <p>执行小车：{{ currentTask.cart }}</p>
        <p>路径节点：{{ currentPath.length }}</p>
      </div>

      <div class="map-visual-legend" aria-hidden="true">
        <span class="map-visual-legend__item">
          <i class="map-visual-legend__dot map-visual-legend__dot--start"></i>绿色：取件点
        </span>
        <span class="map-visual-legend__item">
          <i class="map-visual-legend__dot map-visual-legend__dot--end"></i>橙色：配送终点
        </span>
        <span class="map-visual-legend__item">
          <i class="map-visual-legend__dot map-visual-legend__dot--path"></i>蓝色：规划路径
        </span>
        <span class="map-visual-legend__item">
          <i class="map-visual-legend__dot map-visual-legend__dot--cart"></i>高亮小车：当前执行车辆
        </span>
      </div>

      <div
        class="map-control-hint"
        :class="{ 'map-control-hint--active': interactionState.activeDragMode }"
      >
        <p class="map-control-hint__title">
          {{
            interactionState.activeDragMode === 'rotate'
              ? '正在旋转地图'
              : interactionState.activeDragMode === 'pan'
                ? '正在平移地图'
                : '鼠标控制地图'
          }}
        </p>
        <p>左键拖拽旋转 · 右键拖拽平移</p>
        <p>滚轮缩放</p>
      </div>
    </div>
  </section>
</template>
