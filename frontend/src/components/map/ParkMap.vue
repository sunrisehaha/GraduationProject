<script setup>
// 地图组件：接收当前任务、小车和订单数据，然后交给 Three.js 场景模块绘制。
import { computed, ref } from 'vue'
import { useThreeMapScene } from '../../composables/useThreeMapScene'

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

useThreeMapScene(sceneRef, sceneData)
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
      <div ref="sceneRef" class="park-three-scene"></div>

      <div class="map-overlay">
        <p class="map-overlay__title">当前任务：{{ currentTask.id }}</p>
        <p>业务单号：{{ currentTask.orderNo }}</p>
        <p>订单状态：{{ currentTask.status }}</p>
        <p>执行小车：{{ currentTask.cart }}</p>
        <p>路径节点：{{ currentPath.length }}</p>
      </div>
    </div>
  </section>
</template>
