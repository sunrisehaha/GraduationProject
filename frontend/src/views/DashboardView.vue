<script setup>
import TopBar from '../components/layout/TopBar.vue'
import StatsBar from '../components/layout/StatsBar.vue'
import ParkMap from '../components/map/ParkMap.vue'
import CreateOrderCard from '../components/panels/CreateOrderCard.vue'
import CurrentTaskCard from '../components/panels/CurrentTaskCard.vue'
import FleetStatusCard from '../components/panels/FleetStatusCard.vue'
import SystemLogCard from '../components/panels/SystemLogCard.vue'

const stats = [
  { label: '总订单数', value: '24', meta: '后续接入 /api/orders 统计结果' },
  { label: '执行中订单', value: '6', meta: '包含已分配和配送中的订单' },
  { label: '已完成订单', value: '18', meta: '后台自动调度完成的订单' },
  { label: '空闲小车', value: '4', meta: '当前可接收新任务的小车数量' }
]

const currentTask = {
  id: '#1024',
  start: '(2, 3)',
  end: '(15, 8)',
  status: '待接入后端状态',
  cart: 'Cart-3'
}

const fleet = [
  { name: 'Cart-1', position: '(2, 2)', status: '空闲' },
  { name: 'Cart-2', position: '(10, 5)', status: '前往取件点' },
  { name: 'Cart-3', position: '(6, 7)', status: '配送中' }
]

const logs = [
  { text: 'Vue 前端迁移骨架已完成。', time: '刚刚' },
  { text: '下一阶段将接入 Flask /api 数据。', time: '刚刚' },
  { text: '当前页面仍然是静态占位视图。', time: '刚刚' }
]
</script>

<template>
  <div class="screen-shell">
    <TopBar />
    <StatsBar :stats="stats" />

    <main class="dashboard-layout">
      <ParkMap />

      <aside class="sidebar">
        <CreateOrderCard />
        <CurrentTaskCard :task="currentTask" />
        <FleetStatusCard :fleet="fleet" />
        <SystemLogCard :logs="logs" />
      </aside>
    </main>
  </div>
</template>
