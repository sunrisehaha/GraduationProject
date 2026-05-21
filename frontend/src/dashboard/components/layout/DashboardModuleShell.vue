<script setup>
// 驾驶舱模块外壳：统一负责模块标题、摘要和收起展开。
defineProps({
  module: {
    type: Object,
    required: true,
  },
  isOpen: {
    type: Boolean,
    required: true,
  },
  isEditing: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <section
    class="dashboard-module"
    :class="{
      'dashboard-module--closed': !isOpen,
      'dashboard-module--editing': isEditing,
    }"
  >
    <header class="dashboard-module__header">
      <span class="dashboard-module__title-wrap">
        <span class="dashboard-module__eyebrow">{{ module.eyebrow }}</span>
        <span class="dashboard-module__title">{{ module.title }}</span>
      </span>

      <span v-if="module.summary" class="dashboard-module__summary">{{ module.summary }}</span>

      <button
        type="button"
        class="dashboard-module__toggle"
        :aria-expanded="isOpen"
        :aria-label="isOpen ? `收起${module.title}` : `展开${module.title}`"
        @click.stop="emit('toggle', module.id)"
      >
        <span aria-hidden="true"></span>
      </button>
    </header>

    <div v-show="isOpen" class="dashboard-module__body">
      <slot />
    </div>
  </section>
</template>
