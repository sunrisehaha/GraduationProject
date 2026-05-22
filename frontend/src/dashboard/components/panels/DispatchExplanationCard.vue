<script setup>
// 调度解释卡片：展示电量、距离和车队均衡共同参与的候选车评分过程。
import { computed, ref } from 'vue'

const props = defineProps({
  explanation: {
    type: Object,
    required: true,
  },
})

const detailOpen = ref(false)

const selectedCandidate = computed(() =>
  props.explanation.candidates?.find((candidate) => candidate.selected)
)

const scoreFactors = [
  {
    title: '空驶距离',
    text: '小车离取件点越近，空驶成本越低。',
  },
  {
    title: '低电量惩罚',
    text: '电量越紧张，越不适合接长路线。',
  },
  {
    title: '近期接单惩罚',
    text: '短时间接单太多的小车会被降权，避免过度集中。',
  },
  {
    title: '长期未使用奖励',
    text: '更久没接单的小车会获得一点优先级，保持车队均衡。',
  },
]

function toggleDetail() {
  detailOpen.value = !detailOpen.value
}
</script>

<template>
  <section class="panel-card dispatch-explanation-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">调度解释</p>
        <h2>调度解释</h2>
      </div>
    </div>

    <template v-if="explanation.hasExplanation">
      <button
        type="button"
        class="dispatch-insight-toggle"
        :aria-expanded="detailOpen"
        @click="toggleDetail"
      >
        <span class="dispatch-insight-toggle__copy">
          <strong>查看调度逻辑</strong>
          <span>{{ explanation.orderText }}</span>
        </span>
        <span class="dispatch-insight-toggle__result">
          选中 {{ explanation.selectedCartText }}
        </span>
      </button>

      <div v-if="detailOpen" class="dispatch-detail">
        <div class="dispatch-summary-row">
          <span>{{ explanation.strategy }}</span>
          <span>{{ explanation.orderText }}</span>
          <span>选中 {{ explanation.selectedCartText }}</span>
          <span>{{ explanation.selectedPathText }}</span>
        </div>

        <div class="dispatch-decision-card">
          <p class="dispatch-decision-card__label">本次决策</p>
          <h3>{{ explanation.selectedCartText }} 综合成本最低</h3>
          <p>{{ explanation.summary }}</p>
        </div>

        <div class="dispatch-logic-grid">
          <article class="dispatch-logic-block">
            <span>目标</span>
            <strong>找一辆最适合当前订单的小车</strong>
            <p>系统不是只看距离，而是同时考虑距离、电量和车队负载。</p>
          </article>
          <article class="dispatch-logic-block">
            <span>评分</span>
            <strong>{{ explanation.scoreFormula || '综合成本越低越优先' }}</strong>
            <p>候选车逐项打分后，综合成本最低的一辆会被选中。</p>
          </article>
          <article class="dispatch-logic-block dispatch-logic-block--accent">
            <span>结果</span>
            <strong>{{ selectedCandidate?.scoreText || '-' }}</strong>
            <p>{{ selectedCandidate?.cart_name || explanation.selectedCartText }} 当前排名第一。</p>
          </article>
        </div>

        <div class="dispatch-factor-list">
          <article
            v-for="factor in scoreFactors"
            :key="factor.title"
            class="dispatch-factor"
          >
            <strong>{{ factor.title }}</strong>
            <p>{{ factor.text }}</p>
          </article>
        </div>

        <div class="dispatch-table-wrap">
          <table class="dispatch-table">
            <thead>
              <tr>
                <th>小车</th>
                <th>状态</th>
                <th>空驶</th>
                <th>电量</th>
                <th>预计耗电</th>
                <th>近期任务</th>
                <th>综合分</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="candidate in explanation.candidates"
                :key="candidate.cart_id"
                :class="{ 'dispatch-table__row--selected': candidate.selected }"
              >
                <td>{{ candidate.cart_name }}</td>
                <td>{{ candidate.statusText }}</td>
                <td>{{ candidate.distanceText }}</td>
                <td>{{ candidate.batteryText }}</td>
                <td>{{ candidate.estimatedBatteryText }}</td>
                <td>{{ candidate.recentTaskText }}</td>
                <td>{{ candidate.scoreText }}</td>
                <td>{{ candidate.result }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <p v-else class="empty-text">暂无调度决策。</p>
  </section>
</template>
