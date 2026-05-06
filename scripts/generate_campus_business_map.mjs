// 园区业务地图 SVG 生成脚本：直接读取业务规则，输出和代码一致的 2D 平面图。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  campusBusinessMap,
  campusRoadCorridors,
  campusServicePoints,
  campusZones,
} from '../frontend/src/composables/campusBusinessMap.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const cellSize = 16
const mapWidth = campusBusinessMap.gridCols * cellSize
const mapHeight = campusBusinessMap.gridRows * cellSize
const mapX = 56
const mapY = 130
const legendX = mapX + mapWidth + 48
const canvasWidth = legendX + 360
const canvasHeight = 920
const outputPath = path.resolve(__dirname, '../frontend/public/scene/campus-business-map.svg')

function zoneStyle(zone) {
  if (zone.kind === 'residential') {
    return { fill: '#cbbcff', stroke: '#7b66d8' }
  }

  if (zone.id === 'hub_express_main') {
    return { fill: '#8fe0c8', stroke: '#4a9c84' }
  }

  if (zone.kind === 'service' || zone.kind === 'property' || zone.kind === 'admin') {
    return { fill: '#8fd6ff', stroke: '#4e8fc4' }
  }

  if (zone.kind === 'community') {
    return { fill: '#9fe2d5', stroke: '#4c9d8d' }
  }

  if (zone.kind === 'sports') {
    return { fill: '#ffd89a', stroke: '#c99439' }
  }

  if (zone.kind === 'utility') {
    return { fill: '#ffb7a7', stroke: '#d56d57' }
  }

  if (zone.reserveUse === 'plaza') {
    return { fill: '#ffe6b0', stroke: '#c89a3a' }
  }

  if (zone.reserveUse === 'parking') {
    return { fill: '#fbe5a8', stroke: '#b28b1d' }
  }

  if (zone.reserveUse === 'logistics') {
    return { fill: '#d4f1ff', stroke: '#4a98c7' }
  }

  return { fill: '#c0ebca', stroke: '#6aa373' }
}

function pointStyle(type) {
  switch (type) {
    case 'gate':
      return { fill: '#7dd3fc', stroke: '#0f6d94', radius: 7 }
    case 'hub':
      return { fill: '#34d399', stroke: '#147a55', radius: 8 }
    case 'pickup':
      return { fill: '#22d3ee', stroke: '#0e8092', radius: 8 }
    case 'parking':
      return { fill: '#fbbf24', stroke: '#9a6a08', radius: 8 }
    case 'barrier':
      return { fill: '#f97316', stroke: '#a64508', radius: 8 }
    default:
      return { fill: '#fb7185', stroke: '#b3264f', radius: 6 }
  }
}

function rectToSvg(rect, style, radius = 10) {
  return `<rect x="${mapX + rect.x * cellSize}" y="${mapY + rect.y * cellSize}" width="${rect.width * cellSize}" height="${rect.height * cellSize}" rx="${radius}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="2" />`
}

function pointToSvg(point, style) {
  return `<circle cx="${mapX + point.x * cellSize + cellSize / 2}" cy="${mapY + point.y * cellSize + cellSize / 2}" r="${style.radius}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="2" />`
}

function zoneLabelLines(zone) {
  const presets = {
    住户服务大楼: ['住户服务', '大楼'],
    党群服务中心: ['党群服务', '中心'],
    物业管理中心: ['物业管理', '中心'],
    快递服务中心: ['快递服务', '中心'],
    运动健身中心: ['运动健身', '中心'],
    中央步行广场: ['中央步行', '广场'],
    中央绿化隔离带: ['中央绿化', '隔离带'],
    北侧景观口袋绿地: ['北侧景观', '绿地'],
    南侧景观口袋绿地: ['南侧景观', '绿地'],
    调度停车预留区: ['调度停车', '预留区'],
    快递中心装卸作业区: ['快递装卸', '作业区'],
  }

  if (zone.kind === 'residential') {
    return [zone.name.replace('住宅楼', '')]
  }

  return presets[zone.name] || [zone.name]
}

function zoneTextSvg(zone) {
  const centerX = mapX + (zone.rect.x + zone.rect.width / 2) * cellSize
  const centerY = mapY + (zone.rect.y + zone.rect.height / 2) * cellSize
  const lines = zoneLabelLines(zone)
  const startY = centerY - ((lines.length - 1) * 16) / 2 + 5

  return `
    <text x="${centerX}" y="${startY}" text-anchor="middle" class="${lines.length > 1 ? 'zone-small' : 'zone-label'}">
      ${lines
        .map(
          (line, index) =>
            `<tspan x="${centerX}" dy="${index === 0 ? 0 : 16}">${line}</tspan>`
        )
        .join('')}
    </text>
  `
}

function pointLabelText(pointItem) {
  if (pointItem.id.startsWith('marker_residential_')) {
    return pointItem.name.replace('住宅楼收件点', '栋收件点')
  }

  return pointItem.name
}

function pointLabelPosition(pointItem) {
  const baseX = mapX + pointItem.point.x * cellSize + cellSize / 2
  const baseY = mapY + pointItem.point.y * cellSize + cellSize / 2

  if (pointItem.type === 'delivery' && pointItem.id.startsWith('marker_residential_')) {
    return { x: baseX + 10, y: baseY - 6, anchor: 'start' }
  }

  if (pointItem.type === 'delivery') {
    return { x: baseX + 12, y: baseY - 8, anchor: 'start' }
  }

  return { x: baseX + 14, y: baseY - 8, anchor: 'start' }
}

function pointTextSvg(pointItem) {
  const position = pointLabelPosition(pointItem)
  return `<text x="${position.x}" y="${position.y}" text-anchor="${position.anchor}" class="point-label">${pointLabelText(pointItem)}</text>`
}

function gridAxisSvg() {
  const labels = []

  for (let x = 0; x < campusBusinessMap.gridCols; x += 5) {
    labels.push(
      `<text x="${mapX + x * cellSize + 2}" y="${mapY - 10}" class="axis-label">${x}</text>`
    )
  }

  for (let y = 0; y < campusBusinessMap.gridRows; y += 5) {
    labels.push(
      `<text x="${mapX - 28}" y="${mapY + y * cellSize + 12}" class="axis-label">${y}</text>`
    )
  }

  labels.push(
    `<text x="${mapX + mapWidth - 34}" y="${mapY - 10}" class="axis-label">x=59</text>`,
    `<text x="${mapX - 36}" y="${mapY + mapHeight + 4}" class="axis-label">y=44</text>`
  )

  return labels.join('\n')
}

function escapeText(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const zoneSvg = campusZones
  .map((zone) => {
    const style = zoneStyle(zone)
    return `${rectToSvg(zone.rect, style, zone.kind === 'residential' ? 10 : 12)}${zoneTextSvg(zone)}`
  })
  .join('\n')

const roadSvg = campusRoadCorridors
  .map((road) => rectToSvg(road.rect, { fill: '#d8edf8', stroke: '#d8edf8' }, 4))
  .join('\n')

const servicePointSvg = campusServicePoints
  .map((pointItem) => {
    const style = pointStyle(pointItem.type)
    return `${pointToSvg(pointItem.point, style)}${pointTextSvg(pointItem)}`
  })
  .join('\n')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <defs>
    <style>
      .title { font: 700 28px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #16324f; }
      .subtitle { font: 400 15px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #5e7892; }
      .legend-title { font: 700 18px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #16324f; }
      .legend-text { font: 400 13px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #37506a; }
      .zone-label { font: 600 13px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #17324f; }
      .zone-small { font: 600 12px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #17324f; }
      .point-label { font: 600 11px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #17324f; }
      .axis-label { font: 400 11px 'SF Mono', Consolas, monospace; fill: #7f92a6; }
      .section-label { font: 700 20px 'PingFang SC', 'Microsoft YaHei', sans-serif; fill: #204364; opacity: 0.52; letter-spacing: 1px; }
    </style>
    <pattern id="grid" width="${cellSize}" height="${cellSize}" patternUnits="userSpaceOnUse">
      <path d="M ${cellSize} 0 L 0 0 0 ${cellSize}" fill="none" stroke="#d8e5ef" stroke-width="1" />
    </pattern>
  </defs>

  <rect width="${canvasWidth}" height="${canvasHeight}" fill="#f4fbff" />
  <rect x="24" y="24" width="${canvasWidth - 48}" height="${canvasHeight - 48}" rx="26" fill="#ffffff" stroke="#d8e7f2" />

  <text x="56" y="74" class="title">智慧园区配送业务地图 2D 平面图</text>
  <text x="56" y="102" class="subtitle">当前版本：60 x 45 网格 · 8 栋住宅楼 + 公共服务区 + 中央开放区 + 物流区</text>

  <g>
    <rect x="${mapX}" y="${mapY}" width="${mapWidth}" height="${mapHeight}" rx="18" fill="#eef7fb" stroke="#d8e7f1" />
    <rect x="${mapX}" y="${mapY}" width="${mapWidth}" height="${mapHeight}" fill="url(#grid)" rx="18" />
    ${roadSvg}
    ${zoneSvg}
    <text x="${mapX + 90}" y="${mapY + 40}" class="section-label">住宅区</text>
    <text x="${mapX + 360}" y="${mapY + 370}" class="section-label">中央开放区</text>
    <text x="${mapX + 715}" y="${mapY + 58}" class="section-label">公共服务区</text>
    <text x="${mapX + 760}" y="${mapY + 190}" class="section-label">物流区</text>
    ${servicePointSvg}
    <rect x="${mapX}" y="${mapY}" width="${mapWidth}" height="${mapHeight}" rx="18" fill="none" stroke="#8ba8c0" stroke-width="2" />
    ${gridAxisSvg()}
  </g>

  <g transform="translate(${legendX},150)">
    <text x="0" y="0" class="legend-title">图例</text>

    <rect x="0" y="24" width="26" height="16" rx="4" fill="#d8edf8" />
    <text x="38" y="37" class="legend-text">主路 / 服务车道：小车主通行骨架</text>

    <rect x="0" y="56" width="26" height="16" rx="4" fill="#cbbcff" />
    <text x="38" y="69" class="legend-text">住宅楼：8 栋高频上门送件建筑</text>

    <rect x="0" y="88" width="26" height="16" rx="4" fill="#8fd6ff" />
    <text x="38" y="101" class="legend-text">公共服务建筑：住户服务、物业、综合楼等</text>

    <rect x="0" y="120" width="26" height="16" rx="4" fill="#8fe0c8" />
    <text x="38" y="133" class="legend-text">快递服务中心：装货与出件核心枢纽</text>

    <rect x="0" y="152" width="26" height="16" rx="4" fill="#ffe6b0" />
    <text x="38" y="165" class="legend-text">步行广场：行人活动区，小车不可穿行</text>

    <rect x="0" y="184" width="26" height="16" rx="4" fill="#c0ebca" />
    <text x="38" y="197" class="legend-text">绿地 / 隔离带：未来树木和景观扩展区</text>

    <rect x="0" y="216" width="26" height="16" rx="4" fill="#fbe5a8" />
    <text x="38" y="229" class="legend-text">停车预留区：空闲小车待命和扩展车位</text>

    <circle cx="13" cy="276" r="8" fill="#34d399" />
    <text x="38" y="281" class="legend-text">装货点：小车统一装货起运点</text>

    <circle cx="13" cy="308" r="8" fill="#22d3ee" />
    <text x="38" y="313" class="legend-text">出件口：物流枢纽对外出件点</text>

    <circle cx="13" cy="340" r="6" fill="#fb7185" />
    <text x="38" y="345" class="legend-text">收件点：每栋楼的稳定楼下收件点</text>

    <circle cx="13" cy="372" r="8" fill="#fbbf24" />
    <text x="38" y="377" class="legend-text">停车点：空闲小车调度等待区</text>

    <circle cx="13" cy="404" r="7" fill="#7dd3fc" />
    <text x="38" y="409" class="legend-text">门岗：入口 / 离场入口</text>

    <circle cx="13" cy="436" r="8" fill="#f97316" />
    <text x="38" y="441" class="legend-text">路障：演示特殊事件或禁行提醒</text>

    <text x="0" y="500" class="legend-title">这版解决了什么</text>
    <text x="0" y="528" class="legend-text">1. 住宅区体量和公共建筑比例更均衡。</text>
    <text x="0" y="556" class="legend-text">2. 中央开放区和绿地预留了树木、行人、车辆扩展空间。</text>
    <text x="0" y="584" class="legend-text">3. 物流区、门岗、停车区和楼栋收件点的业务关系更清楚。</text>

    <text x="0" y="640" class="legend-title">未来地址输入示例</text>
    <text x="0" y="668" class="legend-text">${escapeText('住宅：1栋101室、5栋302室、8栋2单元401室')}</text>
    <text x="0" y="696" class="legend-text">${escapeText('公共楼：综合楼、住户服务大楼、运动健身中心')}</text>
    <text x="0" y="724" class="legend-text">系统内部再映射成楼下收件点坐标。</text>
  </g>
</svg>
`

fs.writeFileSync(outputPath, svg, 'utf8')
console.log(`已生成 ${outputPath}`)
