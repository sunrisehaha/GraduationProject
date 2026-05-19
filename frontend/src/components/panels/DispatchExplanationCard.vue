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
        <p class="panel-card__eyebrow">DISPATCH REASON</p>
        <h2>调度解释</h2>
      </div>
      <p class="panel-card__desc">说明系统为什么把当前订单分配给这辆小车。</p>
    </div>

    <template v-if="explanation.hasExplanation">
      <div class="panel-note">
        <p class="panel-note__title">{{ explanation.strategy }}</p>
        <p class="panel-note__text">{{ explanation.summary }}</p>
        <p v-if="explanation.scoreFormula" class="panel-note__text">
          评分：{{ explanation.scoreFormula }}
        </p>
      </div>

      <div class="info-stack">
        <div class="info-row">
          <span class="info-row__label">订单</span>
          <span class="info-row__value">{{ explanation.orderText }}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">选中小车</span>
          <span class="info-row__value">{{ explanation.selectedCartText }}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">完整路径</span>
          <span class="info-row__value">{{ explanation.selectedPathText }}</span>
        </div>
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
    </template>

    <p v-else class="empty-text">还没有调度决策。创建演示订单后，这里会展示候选小车比较过程。</p>
  </section>
</template>
