<script setup>
// 布局设置抽屉：只处理模块显示隐藏，避免把驾驶舱做成复杂低代码编辑器。
defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  modules: {
    type: Array,
    required: true,
  },
  visibleState: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['close', 'reset-layout', 'save-layout', 'set-visible'])
</script>

<template>
  <div v-if="isOpen" class="layout-drawer-layer" @click.self="emit('close')">
    <aside class="layout-settings-drawer" aria-label="布局设置">
      <header class="layout-settings-drawer__header">
        <div>
          <p class="panel-card__eyebrow">LAYOUT</p>
          <h2>布局设置</h2>
        </div>
        <button type="button" class="layout-icon-button" aria-label="关闭布局设置" @click="emit('close')">
          ×
        </button>
      </header>

      <section class="layout-settings-block">
        <div class="layout-settings-block__head">
          <h3>显示 / 隐藏模块</h3>
          <p>隐藏的模块不会在主页面显示，配置会保存在当前浏览器。</p>
        </div>

        <ul class="layout-module-list">
          <li
            v-for="module in modules"
            :key="module.id"
            class="layout-module-item"
            :class="{ 'layout-module-item--hidden': visibleState[module.id] === false }"
          >
            <span class="layout-module-item__title">{{ module.title }}</span>
            <label class="layout-switch">
              <input
                type="checkbox"
                :checked="visibleState[module.id] !== false"
                @change="emit('set-visible', module.id, $event.target.checked)"
              />
              <span></span>
            </label>
          </li>
        </ul>
      </section>

      <footer class="layout-settings-drawer__footer">
        <button type="button" class="layout-button layout-button--ghost" @click="emit('reset-layout')">
          重置布局
        </button>
        <button type="button" class="layout-button" @click="emit('save-layout')">
          保存布局
        </button>
      </footer>
    </aside>
  </div>
</template>
