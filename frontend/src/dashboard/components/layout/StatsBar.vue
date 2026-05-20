<script setup>
// 统计条：页面顶部的四张概览卡都由这里统一渲染。
defineProps({
  stats: {
    type: Array,
    required: true
  },
  statusText: {
    type: String,
    required: true
  },
  lastUpdatedText: {
    type: String,
    required: true
  }
})
</script>

<template>
  <section class="status-strip">
    <article class="status-strip__system">
      <span class="status-chip__dot"></span>
      <div>
        <p class="status-strip__label">系统状态</p>
        <p class="status-strip__value">{{ statusText }}</p>
      </div>
    </article>

    <article v-for="item in stats" :key="item.label" class="status-strip__metric">
      <p class="status-strip__label">{{ item.label }}</p>
      <p class="status-strip__value">{{ item.value }}</p>
      <p class="status-strip__meta">{{ item.meta }}</p>
    </article>

    <article class="status-strip__metric status-strip__metric--time">
      <p class="status-strip__label">更新时间</p>
      <p class="status-strip__value">{{ lastUpdatedText.replace('最近刷新时间：', '') }}</p>
    </article>
  </section>
</template>
