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
        <h2>系统消息</h2>
      </div>
      <p class="panel-card__desc">用于反馈订单创建、自动调度、开始配送和完成配送等关键事件。</p>
    </div>

    <p v-if="!logs.length" class="empty-text">后台调度系统已启动，等待新的业务事件。</p>

    <ul v-else class="message-list message-list--scroll">
      <li
        v-for="(log, index) in logs"
        :key="`${log.text}-${log.time}`"
        class="message-item"
        :class="{ 'message-item--latest': index === 0 }"
      >
        <p class="message-item__text">{{ log.text }}</p>
        <p class="message-item__time">{{ log.time }}</p>
      </li>
    </ul>
  </section>
</template>
