<script setup>
// 折叠区块：只负责收起次要面板，不接管原有业务卡片逻辑。
defineProps({
  eyebrow: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    required: true,
  },
  summary: {
    type: String,
    default: '',
  },
  defaultOpen: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <details class="collapsible-section" :open="defaultOpen">
    <summary class="collapsible-section__summary">
      <span class="collapsible-section__chevron" aria-hidden="true"></span>
      <span class="collapsible-section__text">
        <span v-if="eyebrow" class="collapsible-section__eyebrow">{{ eyebrow }}</span>
        <span class="collapsible-section__title">{{ title }}</span>
      </span>
      <span v-if="summary" class="collapsible-section__meta">{{ summary }}</span>
    </summary>

    <div class="collapsible-section__content">
      <slot />
    </div>
  </details>
</template>
