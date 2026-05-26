<script setup>
// 页面顶部：展示系统品牌和运行状态。
defineProps({
  statusText: {
    type: String,
    required: true,
  },
  stats: {
    type: Array,
    default: () => [],
  },
  lastUpdatedText: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <img class="topbar__mark" src="/favicon.svg" alt="智慧园区快递配送系统图标" />

      <div class="topbar__title">
        <h1>智慧园区快递配送系统</h1>
        <p class="topbar__subtitle">Smart Campus Express Delivery System</p>
      </div>
    </div>

    <div class="topbar__status">
      <span class="topbar__state">
        <span class="status-chip__dot"></span>
        <span>{{ statusText }}</span>
      </span>
      <span
        v-for="item in stats.slice(0, 4)"
        :key="item.label"
        class="topbar__metric"
      >
        {{ item.label }} {{ item.value }}
      </span>
      <span class="topbar__time">{{ lastUpdatedText.replace('最近刷新时间：', '') }}</span>
      <a class="topbar__admin-link" href="/admin">后台管理</a>
    </div>
  </header>
</template>
