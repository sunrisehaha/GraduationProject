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
    'M3.4 14.2c0-1.5 1.2-2.7 2.8-2.7h8.3l1.7-2.7h2.2l2.2 5.4v2.1h-17.2z',
    'M14.5 11.5v-2.7h3.3',
    'M16.2 8.8v-5.3l4.1 1.1l-4.1 1.1',
    'M5 18a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M10.5 18a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M16 18a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
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
    'M5.5 8h6.5',
    'M5.5 13h6.5',
    'M14 10.5l4 4l-4 4',
    'M10 14.5h8',
    'M4 8h0.01',
    'M4 13h0.01',
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
