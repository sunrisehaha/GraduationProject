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
})

const emit = defineEmits(['toggle'])

const iconPaths = {
  task: [
    'M6 5h8',
    'M6 10h12',
    'M6 15h7',
    'M17 14l2 2l4-5',
  ],
  control: [
    'M8 6v12',
    'M16 6v12',
    'M8 10h-3',
    'M8 10h3',
    'M16 14h-3',
    'M16 14h3',
  ],
  fleet: [
    'M4 14h12v-6h-12z',
    'M16 10h3l3 4v4h-6',
    'M7 18a2 2 0 1 0 0.01 0',
    'M18 18a2 2 0 1 0 0.01 0',
  ],
  log: [
    'M6 6h12',
    'M6 11h12',
    'M6 16h8',
    'M4 6h0.01',
    'M4 11h0.01',
    'M4 16h0.01',
  ],
  dispatch: [
    'M5 12h5',
    'M14 7l5 5l-5 5',
    'M10 12h9',
    'M7 6a3 3 0 0 1 3 3',
    'M7 18a3 3 0 0 0 3-3',
  ],
  history: [
    'M12 5a7 7 0 1 1-6.2 3.8',
    'M5 5v4h4',
    'M12 9v4l3 2',
  ],
  order: [
    'M7 5h10l2 3v11h-14v-11z',
    'M7 8h12',
    'M12 11v5',
    'M9.5 13.5h5',
  ],
}
</script>

<template>
  <section
    class="dashboard-module"
    :class="{
      'dashboard-module--closed': !isOpen,
    }"
  >
    <header class="dashboard-module__header">
      <span class="dashboard-module__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            v-for="path in iconPaths[module.icon] || iconPaths.task"
            :key="path"
            :d="path"
          />
        </svg>
      </span>

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
