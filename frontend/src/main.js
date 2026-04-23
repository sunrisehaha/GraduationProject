// 前端入口：注册根组件，并把全局样式统一引入。
import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'
import './styles/dashboard.css'
import './styles/components.css'

createApp(App).mount('#app')
