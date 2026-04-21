<script setup>
defineProps({
  fleet: {
    type: Array,
    required: true
  }
})
</script>

<template>
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">FLEET STATUS</p>
        <h2>小车状态</h2>
      </div>
      <p class="panel-card__desc">后续会改成轮询 `/api/carts` 后实时展示所有小车状态。</p>
    </div>

    <div class="info-stack">
      <div class="info-row">
        <span class="info-row__label">主小车名称</span>
        <span class="info-row__value">{{ fleet[0]?.name || '暂无' }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">当前位置</span>
        <span class="info-row__value">{{ fleet[0]?.position || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="info-row__label">运行状态</span>
        <span class="info-row__value info-row__value--badge">{{ fleet[0]?.status || '未知' }}</span>
      </div>
    </div>

    <ul class="mini-list">
      <li v-for="cart in fleet" :key="cart.name" class="mini-list__item">
        <div class="mini-list__head">
          <p class="mini-list__title">{{ cart.name }}</p>
          <span class="info-row__value info-row__value--badge">{{ cart.status }}</span>
        </div>
        <p class="mini-list__meta">坐标：{{ cart.position }}</p>
      </li>
    </ul>
  </section>
</template>
