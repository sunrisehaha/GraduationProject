<script setup>
import { computed, ref } from 'vue'
import { useMapScene } from '../../composables/useMapScene'

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

const canvasRef = ref(null)

// 地图场景数据：把业务数据整理成渲染模块所需的最小输入
const sceneData = computed(() => ({
  carts: props.carts,
  orders: props.orders,
  currentPath: props.currentPath,
}))

useMapScene(canvasRef, sceneData)
</script>

<template>
  <section class="map-section panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">MAP OVERVIEW</p>
        <h2>园区配送地图</h2>
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

      <div class="map-tags">
        <span v-for="tag in mapInfo.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
    </div>

    <div class="canvas-wrap">
      <canvas ref="canvasRef" class="park-canvas" width="800" height="480"></canvas>

      <div class="map-overlay">
        <p class="map-overlay__title">当前任务：{{ currentTask.id }}</p>
        <p>订单状态：{{ currentTask.status }}</p>
        <p>路径节点：{{ currentPath.length }}</p>
      </div>
    </div>
  </section>
</template>
