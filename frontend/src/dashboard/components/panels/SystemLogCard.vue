<script setup>
// 系统消息卡片：按时间倒序展示最近的调度和配送日志。
defineProps({
  logs: {
    type: Array,
    required: true
  }
})
</script>

<template>
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">SYSTEM LOG</p>
        <h2>事件日志</h2>
      </div>
    </div>

    <p v-if="!logs.length" class="empty-text">等待业务事件。</p>

    <ul v-else class="message-list message-list--compact">
      <li
        v-for="(log, index) in logs.slice(0, 8)"
        :key="`${log.text}-${log.time}`"
        class="message-item"
        :class="{ 'message-item--latest': index === 0 }"
      >
        <p class="message-item__time">{{ log.time }}</p>
        <p class="message-item__text">{{ log.text }}</p>
      </li>
    </ul>
  </section>
</template>
