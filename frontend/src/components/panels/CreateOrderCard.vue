<template>
  <section class="panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">MANUAL ORDER</p>
        <h2>创建订单</h2>
      </div>
      <p class="panel-card__desc">骨架阶段先保留表单结构，后续再接入真实提交逻辑。</p>
    </div>

    <form class="order-form">
      <div class="form-grid">
        <label>
          <span>起点 X</span>
          <input type="number" placeholder="0-19" />
        </label>
        <label>
          <span>起点 Y</span>
          <input type="number" placeholder="0-11" />
        </label>
        <label>
          <span>终点 X</span>
          <input type="number" placeholder="0-19" />
        </label>
        <label>
          <span>终点 Y</span>
          <input type="number" placeholder="0-11" />
        </label>
      </div>

      <button type="button">创建订单</button>
    </form>
  </section>
</template>
