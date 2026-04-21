<script setup>
defineProps({
  stats: {
    type: Array,
    required: true
  }
})
</script>

<template>
  <section class="stats-grid">
    <article v-for="item in stats" :key="item.label" class="stat-card">
      <p class="stat-card__label">{{ item.label }}</p>
      <p class="stat-card__value">{{ item.value }}</p>
      <p class="stat-card__meta">{{ item.meta }}</p>
    </article>
  </section>
</template>
