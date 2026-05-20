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
})

const sceneRef = ref(null)

// 地图场景数据：把业务数据整理成渲染模块所需的最小输入
const sceneData = computed(() => ({
  carts: props.carts,
  orders: props.orders,
  currentPath: props.currentPath,
}))

// 3D 场景接收实时业务数据，用于突出当前任务、路径和小车位置。
const { interactionState } = useThreeCampusPrototype(sceneRef, sceneData)
</script>

<template>
  <section class="map-section panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">MAP OVERVIEW</p>
        <h2>智慧园区 3D 调度沙盘</h2>
      </div>
      <p class="panel-card__desc">{{ mapInfo.summary }}</p>
    </div>

    <div class="map-toolbar">
      <div class="legend">
        <span class="legend__item"><i class="legend__swatch legend__swatch--cart"></i>空闲小车</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--busy"></i>执行中小车</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--obstacle"></i>建筑 / 障碍物</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--start"></i>起点</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--end"></i>终点</span>
      </div>
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
