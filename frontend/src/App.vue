<script setup>
// 应用根组件：根据访问路径加载驾驶舱或后台管理，避免后台页面启动 3D 主场景。
import { computed, defineAsyncComponent } from 'vue'

const DashboardView = defineAsyncComponent(() => import('./dashboard/DashboardView.vue'))
const AdminView = defineAsyncComponent(() => import('./admin/AdminView.vue'))

const currentPath = window.location.pathname.replace(/\/+$/, '') || '/'
const currentView = computed(() => (currentPath === '/admin' ? AdminView : DashboardView))
</script>

<template>
  <component :is="currentView" />
</template>
