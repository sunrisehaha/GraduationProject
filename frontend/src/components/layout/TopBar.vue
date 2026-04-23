<script setup>
// 页面顶部：负责展示系统标题、总说明和最新刷新时间。
defineProps({
  statusText: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    required: true,
  },
  lastUpdatedText: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <header class="topbar">
    <div class="topbar__title">
      <p class="eyebrow">SMART PARK DISPATCH STUDIO</p>
      <h1>智慧园区快递配送系统</h1>
      <p class="topbar__subtitle">{{ subtitle }}</p>
    </div>

    <div class="topbar__status">
      <div class="status-chip">
        <span class="status-chip__dot"></span>
        <span>{{ statusText }}</span>
      </div>
      <p class="last-updated">{{ lastUpdatedText }}</p>
    </div>
  </header>
</template>
