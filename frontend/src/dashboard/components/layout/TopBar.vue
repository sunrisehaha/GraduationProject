<script setup>
// 页面顶部：展示系统品牌、运行状态和布局操作入口。
defineProps({
  isLayoutEditing: {
    type: Boolean,
    default: false,
  },
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

const emit = defineEmits(['toggle-layout-editing', 'open-layout-settings', 'refresh'])
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <img class="topbar__mark" src="/favicon.svg" alt="智慧园区快递配送系统图标" />

      <div class="topbar__title">
        <h1>智慧园区快递配送系统</h1>
      </div>
    </div>

    <div class="topbar__status">
      <span class="status-chip__dot"></span>
      <span>{{ statusText }}</span>
      <span
        v-for="item in stats.slice(0, 4)"
        :key="item.label"
        class="topbar__metric"
      >
        {{ item.label }} {{ item.value }}
      </span>
      <span class="topbar__time">{{ lastUpdatedText.replace('最近刷新时间：', '') }}</span>
    </div>

    <div class="topbar__actions">
      <button
        type="button"
        class="topbar-button topbar-button--ghost"
        @click="emit('toggle-layout-editing')"
      >
        {{ isLayoutEditing ? '退出编辑' : '编辑布局' }}
      </button>
      <button type="button" class="topbar-button topbar-button--ghost" @click="emit('refresh')">
        刷新数据
      </button>
      <button type="button" class="topbar-button" @click="emit('open-layout-settings')">
        布局设置
      </button>
    </div>
  </header>
</template>
