<template>
  <section class="map-section panel-card">
    <div class="panel-card__header">
      <div>
        <p class="panel-card__eyebrow">MAP OVERVIEW</p>
        <h2>园区配送地图</h2>
      </div>
      <p class="panel-card__desc">当前先迁移 Vue 页面结构，下一阶段再接入 Canvas 2.5D 园区渲染与实时状态。</p>
    </div>

    <div class="map-toolbar">
      <div class="legend">
        <span class="legend__item"><i class="legend__swatch legend__swatch--cart"></i>空闲小车</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--busy"></i>执行中小车</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--obstacle"></i>建筑 / 障碍物</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--start"></i>起点</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--end"></i>终点</span>
      </div>

      <div class="map-tags">
        <span class="tag">地图规模 20 x 12</span>
        <span class="tag">/api 代理待接入</span>
        <span class="tag">Canvas 渲染待迁移</span>
      </div>
    </div>

    <div class="canvas-wrap">
      <div class="map-placeholder">
        <div>
          <p class="map-placeholder__title">ParkMap.vue</p>
          <p>这里会迁移当前项目里的 2.5D 园区场景、路径绘制和小车状态显示。</p>
        </div>
      </div>
    </div>
  </section>
</template>
