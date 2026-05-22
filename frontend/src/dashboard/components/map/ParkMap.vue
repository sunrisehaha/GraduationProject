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
    </div>

    <div class="canvas-wrap">
      <div
        ref="sceneRef"
        class="park-three-scene"
        :class="{ 'park-three-scene--active': interactionState.activeDragMode }"
        aria-label="园区三维地图"
      ></div>
    </div>
  </section>
</template>
