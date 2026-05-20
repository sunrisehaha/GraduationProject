<script setup>
// 驾驶舱模块外壳：统一负责模块拖拽、收起展开和标题展示。
defineProps({
  module: {
    type: Object,
    required: true,
  },
  isOpen: {
    type: Boolean,
    required: true,
  },
  isDragging: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'drag-start', 'drag-over', 'drag-end', 'drop'])
</script>

<template>
  <section
    class="dashboard-module"
    :class="{
      'dashboard-module--closed': !isOpen,
      'dashboard-module--dragging': isDragging,
    }"
    @dragover.prevent="emit('drag-over', module.id, $event)"
    @drop.prevent="emit('drop', module.id, $event)"
  >
    <header
      class="dashboard-module__header"
      draggable="true"
      @dragstart="emit('drag-start', module.id, $event)"
      @dragend="emit('drag-end')"
    >
      <span class="dashboard-module__drag-handle" aria-hidden="true"></span>

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
        draggable="false"
        @click.stop="emit('toggle', module.id)"
        @dragstart.stop.prevent
      >
        <span aria-hidden="true"></span>
      </button>
    </header>

    <div v-show="isOpen" class="dashboard-module__body">
      <slot />
    </div>
  </section>
</template>
