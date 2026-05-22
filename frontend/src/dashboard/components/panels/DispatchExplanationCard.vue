<script setup>
// 调度解释卡片：展示电量、距离和车队均衡共同参与的候选车评分过程。
defineProps({
  explanation: {
    type: Object,
    required: true,
  },
})
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
      <div class="dispatch-summary-row">
        <span>{{ explanation.strategy }}</span>
        <span>{{ explanation.orderText }}</span>
        <span>选中 {{ explanation.selectedCartText }}</span>
        <span>{{ explanation.selectedPathText }}</span>
      </div>
      <p class="dispatch-summary-text">
        {{ explanation.summary }}
        <span v-if="explanation.scoreFormula"> · 评分：{{ explanation.scoreFormula }}</span>
      </p>

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
    </template>

    <p v-else class="empty-text">暂无调度决策。</p>
  </section>
</template>
