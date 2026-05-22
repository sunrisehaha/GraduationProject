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
    'M5 13h1.4l1.4-3.6h7.6l1.8 3.6h1.8c0.7 0 1.2 0.5 1.2 1.2v2h-2',
    'M7.8 16.2h8.5',
    'M8 16.8a1.7 1.7 0 1 0 0-3.4a1.7 1.7 0 0 0 0 3.4',
    'M16.3 16.8a1.7 1.7 0 1 0 0-3.4a1.7 1.7 0 0 0 0 3.4',
    'M9.1 9.4v3.6',
    'M14.1 9.4v3.6',
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
    'M5.2 12m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
    'M6.8 12c3.4-0.1 4.8-4.8 9.1-4.8',
    'M6.8 12c3.4 0.1 4.8 4.8 9.1 4.8',
    'M17.6 7.2m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0',
    'M17.2 16.8m-1.3 0a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
  ],
  history: [
    'M12 5.2a6.8 6.8 0 1 1 0 13.6a6.8 6.8 0 0 1 0-13.6',
    'M12 8.5v4l3 1.8',
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
      <span
        class="dashboard-module__icon"
        :class="`dashboard-module__icon--${module.icon}`"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            v-for="path in iconPaths[module.icon] || iconPaths.task"
            :key="path"
            :d="path"
          />
        </svg>
      </span>

      <span class="dashboard-module__title-wrap">
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
