<script setup>
// 调度解释卡片：展示最近空闲车优先策略的候选车比较过程。
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
              <th>到取件点</th>
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
              <td>{{ candidate.result }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <p v-else class="empty-text">还没有调度决策。创建演示订单后，这里会展示候选小车比较过程。</p>
  </section>
</template>
