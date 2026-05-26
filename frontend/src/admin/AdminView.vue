<script setup>
// 后台管理页：面向管理员的数据检索、运行监控和安全干预，不启动 Three.js 主场景。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchCarts } from '../api/carts'
import {
  clearRouteObstacle,
  fetchDemoState,
  resetDemoScene,
  setDemoMode,
} from '../api/demo'
import { fetchOrderEventFeed, fetchOrderEvents, fetchOrders } from '../api/orders'
import { campusBusinessMap } from '../campus/campusBusinessMap'
import {
  formatPlace,
  formatPoint,
  formatTime,
  getStatusText,
} from '../dashboard/composables/dashboardFormatters'
import { formatCartName } from '../dashboard/composables/dashboardViewModels'

const refreshIntervalMs = 1200
const eventLimit = 100
const runningOrderStatuses = ['assigned', 'to_pickup', 'delivering']
const activeOrderStatuses = ['pending', ...runningOrderStatuses]

const statusFilters = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待调度' },
  { value: 'assigned', label: '已分配' },
  { value: 'to_pickup', label: '前往取件点' },
  { value: 'delivering', label: '配送中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

const eventFilters = [
  { value: 'all', label: '全部' },
  { value: 'order', label: '订单' },
  { value: 'dispatch', label: '调度' },
  { value: 'cart', label: '小车' },
  { value: 'sensor', label: '传感器' },
  { value: 'road', label: '路况' },
  { value: 'exception', label: '异常' },
]

const orders = ref([])
const carts = ref([])
const demoState = ref({
  demo_mode_enabled: false,
  simulation_paused: false,
  active_orders: 0,
  speed_multiplier: 1,
  dynamic_obstacles: [],
  dynamic_obstacle_count: 0,
})
const events = ref([])
const selectedOrderId = ref(null)
const selectedOrderEvents = ref([])
const selectedCartId = ref(null)
const orderSearchText = ref('')
const orderStatusFilter = ref('all')
const eventFilter = ref('all')
const lastUpdatedText = ref('等待数据加载')
const errorMessage = ref('')
const feedbackText = ref('')
const feedbackType = ref('info')
const runningAction = ref('')

let timerId = null
let isMounted = false
let refreshRequestId = 0

const mapViewBox = computed(() => `0 0 ${campusBusinessMap.gridCols} ${campusBusinessMap.gridRows}`)
const dynamicObstacles = computed(() =>
  Array.isArray(demoState.value.dynamic_obstacles) ? demoState.value.dynamic_obstacles : []
)
const obstacleCells = computed(() =>
  dynamicObstacles.value.flatMap((obstacle) => obstacle.cells || [])
)

const normalizedOrders = computed(() =>
  orders.value
    .slice()
    .sort((left, right) => Number(right.id) - Number(left.id))
    .map((order) => ({
      ...order,
      statusText: getStatusText(order.status),
      startText: formatPlace(order.start_point, order.start_label),
      endText: formatPlace(order.end_point, order.end_label),
      cartText: order.assigned_cart_id ? `小车 ${order.assigned_cart_id}` : '待分配',
      pathNodes: order.path?.length || 0,
    }))
)

const filteredOrders = computed(() => {
  const keyword = normalizeKeyword(orderSearchText.value)

  return normalizedOrders.value.filter((order) => {
    const statusMatched =
      orderStatusFilter.value === 'all' || order.status === orderStatusFilter.value

    if (!statusMatched) {
      return false
    }

    if (!keyword) {
      return true
    }

    const searchTarget = normalizeKeyword([
      order.id,
      order.order_no,
      order.statusText,
      order.startText,
      order.endText,
      order.cartText,
      order.assigned_cart_id ? `cart${order.assigned_cart_id}` : '',
      order.assigned_cart_id ? `小车${order.assigned_cart_id}` : '',
    ].join(' '))

    return searchTarget.includes(keyword)
  })
})

const selectedOrder = computed(
  () => normalizedOrders.value.find((order) => order.id === selectedOrderId.value) || null
)

const adminCarts = computed(() =>
  carts.value
    .slice()
    .sort((left, right) => Number(left.id) - Number(right.id))
    .map((cart) => ({
      ...cart,
      nameText: formatCartName(cart),
      statusText: getStatusText(cart.status),
      positionText: formatPoint({ x: cart.x, y: cart.y }),
      batteryText: `${Math.round(Number(cart.battery_level ?? 0))}%`,
      taskText: cart.current_order_id ? `#${cart.current_order_id}` : '-',
      sensorText: getSensorText(cart.sensor_status),
      hasSensorAlert: Boolean(cart.sensor_status?.detected),
    }))
)

const selectedCart = computed(
  () => adminCarts.value.find((cart) => cart.id === selectedCartId.value) || adminCarts.value[0] || null
)

const filteredEvents = computed(() => {
  if (eventFilter.value === 'all') {
    return events.value
  }

  return events.value.filter((event) => getEventCategory(event) === eventFilter.value)
})

const stats = computed(() => {
  const todayOrders = orders.value.filter((order) => isTodayOrder(order))
  const completedOrders = orders.value.filter((order) => order.status === 'completed')
  const runningOrders = orders.value.filter((order) => runningOrderStatuses.includes(order.status))
  const idleCarts = carts.value.filter((cart) => cart.status === 'idle')
  const sensorAlerts = carts.value.filter((cart) => cart.sensor_status?.detected)

  return {
    todayOrders: todayOrders.length,
    completedOrders: completedOrders.length,
    runningOrders: runningOrders.length,
    activeOrders: orders.value.filter((order) => activeOrderStatuses.includes(order.status)).length,
    idleCarts: idleCarts.length,
    sensorAlerts: sensorAlerts.length,
    obstacleCount: Number(demoState.value.dynamic_obstacle_count || 0),
  }
})

const statusDistribution = computed(() => {
  const total = Math.max(1, orders.value.length)
  return statusFilters
    .filter((item) => item.value !== 'all')
    .map((item) => {
      const count = orders.value.filter((order) => order.status === item.value).length
      return {
        ...item,
        count,
        percent: Math.round((count / total) * 100),
      }
    })
    .filter((item) => item.count > 0)
})

const selectedPathPoints = computed(() => selectedOrder.value?.path || [])
const selectedPathPolyline = computed(() =>
  selectedPathPoints.value.map((point) => `${point.x + 0.5},${point.y + 0.5}`).join(' ')
)

function normalizeKeyword(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
}

function getTodayText() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayCompactText() {
  return getTodayText().replace(/-/g, '')
}

function isTodayOrder(order) {
  const orderNo = String(order.order_no || '')

  if (orderNo.includes(getTodayCompactText())) {
    return true
  }

  return String(order.create_time || '').startsWith(getTodayText())
}

function getSensorText(sensorStatus) {
  if (!sensorStatus) {
    return '传感器待命'
  }

  if (sensorStatus.detected) {
    return `前方 ${sensorStatus.distance_tiles} 格有障碍`
  }

  return sensorStatus.message || '传感器正常'
}

function getStatusTone(status) {
  if (['completed', 'idle'].includes(status)) {
    return 'success'
  }

  if (['pending', 'assigned', 'to_pickup', 'delivering'].includes(status)) {
    return 'info'
  }

  if (status === 'cancelled') {
    return 'muted'
  }

  return 'warning'
}

function getEventCategory(event) {
  const type = String(event.event_type || '')
  const text = `${event.event_desc || ''} ${type}`

  if (type.includes('sensor')) {
    return 'sensor'
  }

  if (['rerouted', 'blocked'].includes(type) || text.includes('障碍') || text.includes('路况')) {
    return type === 'blocked' ? 'exception' : 'road'
  }

  if (type === 'assigned' || text.includes('调度') || text.includes('分配')) {
    return 'dispatch'
  }

  if (text.includes('小车')) {
    return 'cart'
  }

  return 'order'
}

function getEventCategoryText(event) {
  const categoryTextMap = {
    order: '订单',
    dispatch: '调度',
    cart: '小车',
    sensor: '传感器',
    road: '路况',
    exception: '异常',
  }

  return categoryTextMap[getEventCategory(event)] || '系统'
}

function getObstacleText(obstacle) {
  if (!obstacle) {
    return '暂无临时障碍'
  }

  const center = obstacle.center || obstacle.cells?.[0] || {}
  const modeText = obstacle.block_mode === 'full_closure' ? '封闭' : '局部占道'
  return `${obstacle.road_width || '-'} 格路${modeText} · (${center.x ?? '-'}, ${center.y ?? '-'})`
}

function selectOrder(orderId) {
  selectedOrderId.value = orderId
  loadSelectedOrderEvents(orderId)
}

function selectCart(cartId) {
  selectedCartId.value = cartId
}

function scheduleRefresh() {
  if (!isMounted) {
    return
  }

  timerId = window.setTimeout(async () => {
    timerId = null
    await refreshData()
    scheduleRefresh()
  }, refreshIntervalMs)
}

function clearRefreshTimer() {
  if (!timerId) {
    return
  }

  window.clearTimeout(timerId)
  timerId = null
}

async function loadSelectedOrderEvents(orderId) {
  if (!orderId) {
    selectedOrderEvents.value = []
    return
  }

  try {
    selectedOrderEvents.value = await fetchOrderEvents(orderId)
  } catch (error) {
    selectedOrderEvents.value = []
    errorMessage.value = error.message
  }
}

async function refreshData() {
  const requestId = ++refreshRequestId

  try {
    errorMessage.value = ''
    const [latestCarts, latestOrders, latestDemoState, latestEvents] = await Promise.all([
      fetchCarts(),
      fetchOrders('all'),
      fetchDemoState(),
      fetchOrderEventFeed(eventLimit),
    ])

    if (requestId !== refreshRequestId) {
      return
    }

    carts.value = latestCarts
    orders.value = latestOrders
    demoState.value = latestDemoState
    events.value = latestEvents

    const orderExists = latestOrders.some((order) => order.id === selectedOrderId.value)
    const defaultOrder = latestOrders
      .slice()
      .sort((left, right) => Number(right.id) - Number(left.id))
      .find((order) => activeOrderStatuses.includes(order.status)) || latestOrders[latestOrders.length - 1] || null
    selectedOrderId.value = orderExists ? selectedOrderId.value : defaultOrder?.id || null

    const cartExists = latestCarts.some((cart) => cart.id === selectedCartId.value)
    selectedCartId.value = cartExists ? selectedCartId.value : latestCarts[0]?.id || null

    await loadSelectedOrderEvents(selectedOrderId.value)
    lastUpdatedText.value = formatTime()
  } catch (error) {
    if (requestId !== refreshRequestId) {
      return
    }

    errorMessage.value = error.message
  }
}

async function runAdminAction(actionName, action, successText) {
  feedbackText.value = ''
  runningAction.value = actionName

  try {
    demoState.value = await action()
    feedbackType.value = 'success'
    feedbackText.value = successText
    await refreshData()
  } catch (error) {
    feedbackType.value = 'error'
    feedbackText.value = error.message
  } finally {
    runningAction.value = ''
  }
}

watch(filteredOrders, (nextOrders) => {
  if (!nextOrders.length) {
    selectedOrderId.value = null
    selectedOrderEvents.value = []
    return
  }

  if (!nextOrders.some((order) => order.id === selectedOrderId.value)) {
    selectedOrderId.value = nextOrders[0].id
    loadSelectedOrderEvents(nextOrders[0].id)
  }
})

onMounted(async () => {
  isMounted = true
  await refreshData()
  scheduleRefresh()
})

onBeforeUnmount(() => {
  isMounted = false
  clearRefreshTimer()
})
</script>

<template>
  <main class="admin-shell">
    <header class="admin-topbar">
      <div class="admin-topbar__brand">
        <img class="admin-topbar__mark" src="/favicon.svg" alt="智慧园区快递配送系统图标" />
        <div>
          <p class="admin-topbar__eyebrow">数据管理模式</p>
          <h1>智慧园区快递配送调度系统</h1>
        </div>
      </div>

      <div class="admin-topbar__status">
        <span class="admin-status-dot"></span>
        <span>系统正常运行</span>
        <span>在线小车 {{ carts.length }}</span>
        <span>执行中订单 {{ stats.runningOrders }}</span>
        <span>今日订单 {{ stats.todayOrders }}</span>
        <span>{{ lastUpdatedText }}</span>
        <a class="admin-link-button" href="/">返回驾驶舱</a>
      </div>
    </header>

    <p v-if="errorMessage" class="admin-feedback admin-feedback--error">{{ errorMessage }}</p>
    <p v-if="feedbackText" class="admin-feedback" :class="`admin-feedback--${feedbackType}`">
      {{ feedbackText }}
    </p>

    <section class="admin-grid">
      <section class="admin-card admin-card--orders">
        <div class="admin-card__header">
          <div>
            <p class="admin-card__eyebrow">ORDER</p>
            <h2>订单管理</h2>
          </div>
          <span>{{ filteredOrders.length }} / {{ orders.length }} 单</span>
        </div>

        <div class="admin-toolbar">
          <input
            v-model="orderSearchText"
            class="admin-search"
            type="search"
            placeholder="搜索订单编号、地点、小车编号、状态"
          />
          <div class="admin-filter-row">
            <button
              v-for="item in statusFilters"
              :key="item.value"
              type="button"
              class="admin-filter-button"
              :class="{ 'admin-filter-button--active': orderStatusFilter === item.value }"
              @click="orderStatusFilter = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>订单编号</th>
                <th>起点</th>
                <th>终点</th>
                <th>状态</th>
                <th>小车</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in filteredOrders"
                :key="order.id"
                :class="{ 'admin-table__row--selected': order.id === selectedOrderId }"
                @click="selectOrder(order.id)"
              >
                <td>{{ order.order_no || `#${order.id}` }}</td>
                <td>{{ order.startText }}</td>
                <td>{{ order.endText }}</td>
                <td>
                  <span class="admin-badge" :class="`admin-badge--${getStatusTone(order.status)}`">
                    {{ order.statusText }}
                  </span>
                </td>
                <td>{{ order.cartText }}</td>
                <td>{{ order.create_time || '-' }}</td>
              </tr>
              <tr v-if="!filteredOrders.length">
                <td colspan="6" class="admin-empty">没有匹配的订单</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-card admin-card--carts">
        <div class="admin-card__header">
          <div>
            <p class="admin-card__eyebrow">FLEET</p>
            <h2>小车管理</h2>
          </div>
          <span>{{ stats.idleCarts }} 空闲</span>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table admin-table--compact">
            <thead>
              <tr>
                <th>小车编号</th>
                <th>状态</th>
                <th>当前位置</th>
                <th>电量</th>
                <th>当前任务</th>
                <th>传感器</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cart in adminCarts"
                :key="cart.id"
                :class="{ 'admin-table__row--selected': cart.id === selectedCart?.id }"
                @click="selectCart(cart.id)"
              >
                <td>{{ cart.nameText }}</td>
                <td>
                  <span class="admin-badge" :class="`admin-badge--${getStatusTone(cart.status)}`">
                    {{ cart.statusText }}
                  </span>
                </td>
                <td>{{ cart.positionText }}</td>
                <td>{{ cart.batteryText }}</td>
                <td>{{ cart.taskText }}</td>
                <td>
                  <span
                    class="admin-badge"
                    :class="cart.hasSensorAlert ? 'admin-badge--warning' : 'admin-badge--success'"
                  >
                    {{ cart.sensorText }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="selectedCart" class="admin-detail-panel">
          <h3>{{ selectedCart.nameText }} 设备详情</h3>
          <dl class="admin-detail-grid">
            <div>
              <dt>当前状态</dt>
              <dd>{{ selectedCart.statusText }}</dd>
            </div>
            <div>
              <dt>当前位置</dt>
              <dd>{{ selectedCart.positionText }}</dd>
            </div>
            <div>
              <dt>当前任务</dt>
              <dd>{{ selectedCart.taskText }}</dd>
            </div>
            <div>
              <dt>传感器</dt>
              <dd>{{ selectedCart.sensorText }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="admin-card admin-card--logs">
        <div class="admin-card__header">
          <div>
            <p class="admin-card__eyebrow">EVENT</p>
            <h2>事件日志</h2>
          </div>
          <span>{{ filteredEvents.length }} 条</span>
        </div>

        <div class="admin-filter-row">
          <button
            v-for="item in eventFilters"
            :key="item.value"
            type="button"
            class="admin-filter-button"
            :class="{ 'admin-filter-button--active': eventFilter === item.value }"
            @click="eventFilter = item.value"
          >
            {{ item.label }}
          </button>
        </div>

        <ol class="admin-log-list">
          <li v-for="event in filteredEvents" :key="event.id" class="admin-log-item">
            <span>{{ event.create_time || '-' }}</span>
            <strong>{{ getEventCategoryText(event) }}</strong>
            <p>订单 #{{ event.order_id }} {{ event.event_desc || event.event_type }}</p>
          </li>
          <li v-if="!filteredEvents.length" class="admin-empty">暂无事件</li>
        </ol>
      </section>

      <section class="admin-card admin-card--stats">
        <div class="admin-card__header">
          <div>
            <p class="admin-card__eyebrow">STATISTICS</p>
            <h2>系统统计</h2>
          </div>
        </div>

        <div class="admin-metric-grid">
          <article>
            <span>今日订单</span>
            <strong>{{ stats.todayOrders }}</strong>
          </article>
          <article>
            <span>已完成订单</span>
            <strong>{{ stats.completedOrders }}</strong>
          </article>
          <article>
            <span>执行中订单</span>
            <strong>{{ stats.runningOrders }}</strong>
          </article>
          <article>
            <span>传感器告警</span>
            <strong>{{ stats.sensorAlerts }}</strong>
          </article>
        </div>

        <div class="admin-distribution">
          <div class="admin-donut" :style="{ '--done': `${statusDistribution[0]?.percent || 0}%` }"></div>
          <ul>
            <li v-for="item in statusDistribution" :key="item.value">
              <span></span>
              {{ item.label }} {{ item.count }} 单（{{ item.percent }}%）
            </li>
          </ul>
        </div>

        <div v-if="selectedOrder" class="admin-detail-panel">
          <h3>订单详情</h3>
          <dl class="admin-detail-grid">
            <div>
              <dt>订单编号</dt>
              <dd>{{ selectedOrder.order_no || `#${selectedOrder.id}` }}</dd>
            </div>
            <div>
              <dt>路径节点</dt>
              <dd>{{ selectedOrder.pathNodes }}</dd>
            </div>
            <div>
              <dt>起点</dt>
              <dd>{{ selectedOrder.startText }}</dd>
            </div>
            <div>
              <dt>终点</dt>
              <dd>{{ selectedOrder.endText }}</dd>
            </div>
          </dl>
          <ol class="admin-mini-events">
            <li v-for="event in selectedOrderEvents" :key="event.id">
              <span>{{ event.create_time || '-' }}</span>
              {{ event.event_desc || event.event_type }}
            </li>
          </ol>
        </div>
      </section>

      <section class="admin-card admin-card--map">
        <div class="admin-card__header">
          <div>
            <p class="admin-card__eyebrow">MAP</p>
            <h2>园区地图预览</h2>
          </div>
          <span>轻量 2D</span>
        </div>

        <div class="admin-map-preview">
          <svg :viewBox="mapViewBox" role="img" aria-label="园区轻量地图预览">
            <rect class="admin-map__base" x="0" y="0" :width="campusBusinessMap.gridCols" :height="campusBusinessMap.gridRows" />
            <rect
              v-for="zone in campusBusinessMap.zones"
              :key="zone.id"
              class="admin-map__zone"
              :x="zone.rect.x"
              :y="zone.rect.y"
              :width="zone.rect.width"
              :height="zone.rect.height"
            />
            <rect
              v-for="road in campusBusinessMap.roads"
              :key="road.id"
              class="admin-map__road"
              :x="road.rect.x"
              :y="road.rect.y"
              :width="road.rect.width"
              :height="road.rect.height"
            />
            <polyline
              v-if="selectedPathPolyline"
              class="admin-map__path"
              :points="selectedPathPolyline"
            />
            <rect
              v-for="cell in obstacleCells"
              :key="`${cell.x}:${cell.y}`"
              class="admin-map__obstacle"
              :x="cell.x"
              :y="cell.y"
              width="1"
              height="1"
            />
            <circle
              v-for="cart in adminCarts"
              :key="cart.id"
              class="admin-map__cart"
              :class="{ 'admin-map__cart--selected': cart.id === selectedCart?.id }"
              :cx="cart.x + 0.5"
              :cy="cart.y + 0.5"
              :r="cart.id === selectedCart?.id ? 1.2 : 0.82"
            />
          </svg>
        </div>

        <div class="admin-road-panel">
          <h3>路况控制</h3>
          <p>{{ getObstacleText(dynamicObstacles[0]) }}</p>
          <div class="admin-action-row">
            <button
              type="button"
              class="admin-action-button admin-action-button--warning"
              :disabled="Boolean(runningAction) || !dynamicObstacles.length"
              @click="runAdminAction('clearObstacle', clearRouteObstacle, '临时障碍已清除。')"
            >
              {{ runningAction === 'clearObstacle' ? '处理中' : '清除障碍' }}
            </button>
            <button
              type="button"
              class="admin-action-button"
              :disabled="Boolean(runningAction)"
              @click="runAdminAction('pause', () => setDemoMode(true), '自动仿真已暂停。')"
            >
              暂停仿真
            </button>
            <button
              type="button"
              class="admin-action-button admin-action-button--ghost"
              :disabled="Boolean(runningAction)"
              @click="runAdminAction('resume', () => setDemoMode(false), '自动仿真已恢复。')"
            >
              恢复仿真
            </button>
            <button
              type="button"
              class="admin-action-button admin-action-button--danger"
              :disabled="Boolean(runningAction)"
              @click="runAdminAction('reset', resetDemoScene, '演示场景已重置。')"
            >
              重置演示
            </button>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>
