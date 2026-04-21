<script setup>
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
      <p class="panel-card__desc">当前已接入前端轮询产生的订单、调度和完成事件消息。</p>
    </div>

    <ul class="message-list">
      <li v-for="log in logs" :key="`${log.text}-${log.time}`" class="message-item">
        <p class="message-item__text">{{ log.text }}</p>
        <p class="message-item__time">{{ log.time }}</p>
      </li>
    </ul>
  </section>
</template>
