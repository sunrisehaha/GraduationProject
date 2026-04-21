const canvas = document.getElementById("parkCanvas");
const ctx = canvas.getContext("2d");

const gridCols = 20;
const gridRows = 12;
const refreshIntervalMs = 1000;

const obstacles = [
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 5, y: 7 },
  { x: 12, y: 3 },
  { x: 12, y: 4 }
];

const roadRows = new Set([2, 6, 9]);
const roadCols = new Set([3, 8, 14, 17]);

// 场景参数：控制等角视角地图的尺寸、原点和地块厚度
const scene = {
  tileWidth: 34,
  tileHeight: 17,
  originX: canvas.width / 2,
  originY: 108,
  baseHeight: 14
};

let carts = [];
let orders = [];
let currentPath = [];
let systemMessages = [];
let isFirstRefresh = true;

// 工具函数：把时间格式化成界面上易读的字符串
function formatTime() {
  return new Date().toLocaleString("zh-CN", {
    hour12: false
  });
}

function getStatusText(status) {
  const statusMap = {
    idle: "空闲",
    pending: "待调度",
    assigned: "已分配",
    to_pickup: "前往取件点",
    delivering: "配送中",
    completed: "已完成"
  };

  return statusMap[status] || status;
}

// 当前任务选择策略：优先展示配送中订单，其次是已分配订单，再其次是待调度订单
function getCurrentOrder() {
  return (
    orders.find((order) => order.status === "delivering") ||
    orders.find((order) => order.status === "assigned") ||
    orders.find((order) => order.status === "pending") ||
    null
  );
}

// 当前主小车选择策略：优先找当前任务绑定的小车，没有就退化为第一台车
function getCurrentCart() {
  const currentOrder = getCurrentOrder();

  if (currentOrder && currentOrder.assigned_cart_id) {
    return carts.find((cart) => cart.id === currentOrder.assigned_cart_id) || carts[0] || null;
  }

  return carts[0] || null;
}

// 系统消息管理：记录最近的业务事件并刷新消息面板
function addSystemMessage(text) {
  systemMessages.unshift({
    text,
    time: formatTime()
  });
  systemMessages = systemMessages.slice(0, 10);
  renderMessageList();
}

// 坐标转换工具：把网格坐标转成 2.5D 等角视角下的屏幕坐标
function gridToScreen(x, y, z = 0) {
  return {
    x: scene.originX + (x - y) * scene.tileWidth / 2,
    y: scene.originY + (x + y) * scene.tileHeight / 2 - z
  };
}

// 根据网格坐标计算一个菱形地块四个顶点的位置
function getTilePoints(x, y, z = 0) {
  const center = gridToScreen(x, y, z);

  return {
    top: { x: center.x, y: center.y - scene.tileHeight / 2 },
    right: { x: center.x + scene.tileWidth / 2, y: center.y },
    bottom: { x: center.x, y: center.y + scene.tileHeight / 2 },
    left: { x: center.x - scene.tileWidth / 2, y: center.y },
    center
  };
}

// 通用绘图工具：绘制任意多边形，是后面道路、地块、建筑的基础
function fillPolygon(points, fillStyle, strokeStyle = null) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }

  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();

  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

// 背景层：天空渐变和氛围光效
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#07131f");
  sky.addColorStop(0.45, "#0a1d31");
  sky.addColorStop(1, "#091622");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(74, 167, 255, 0.08)";
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, 76, 220, 54, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(120, 255, 214, 0.06)";
  ctx.beginPath();
  ctx.ellipse(canvas.width / 2, canvas.height - 68, 290, 48, 0, 0, Math.PI * 2);
  ctx.fill();
}

// 地面投影：让整个园区更有“悬浮在场景里”的立体感
function drawGroundShadow() {
  const top = gridToScreen(0, 0);
  const right = gridToScreen(gridCols - 1, 0);
  const bottom = gridToScreen(gridCols - 1, gridRows - 1);
  const left = gridToScreen(0, gridRows - 1);

  fillPolygon(
    [
      { x: top.x, y: top.y + 20 },
      { x: right.x + 24, y: right.y + 32 },
      { x: bottom.x, y: bottom.y + 54 },
      { x: left.x - 24, y: left.y + 32 }
    ],
    "rgba(0, 0, 0, 0.26)"
  );
}

// 地图逻辑判断：区分障碍物和道路格子
function isObstacleCell(x, y) {
  return obstacles.some((item) => item.x === x && item.y === y);
}

function isRoadCell(x, y) {
  return roadRows.has(y) || roadCols.has(x) || (x >= 8 && x <= 11 && y >= 4 && y <= 7);
}

// 单个地块绘制：根据是否为道路决定颜色和细节
function drawTileSurface(x, y) {
  const points = getTilePoints(x, y);
  const isRoad = isRoadCell(x, y);
  const topColor = isRoad ? "#3f556e" : "#3b7c57";
  const leftColor = isRoad ? "#33475f" : "#2f6245";
  const rightColor = isRoad ? "#4c6681" : "#468f63";

  fillPolygon(
    [points.top, points.right, points.bottom, points.left],
    topColor,
    "rgba(10, 20, 30, 0.15)"
  );

  fillPolygon(
    [
      points.left,
      points.bottom,
      { x: points.bottom.x, y: points.bottom.y + scene.baseHeight },
      { x: points.left.x, y: points.left.y + scene.baseHeight }
    ],
    leftColor
  );

  fillPolygon(
    [
      points.right,
      points.bottom,
      { x: points.bottom.x, y: points.bottom.y + scene.baseHeight },
      { x: points.right.x, y: points.right.y + scene.baseHeight }
    ],
    rightColor
  );

  if (isRoad) {
    ctx.strokeStyle = "rgba(188, 220, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points.left.x + 4, points.left.y);
    ctx.lineTo(points.right.x - 4, points.right.y);
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(130, 210, 152, 0.18)";
    ctx.beginPath();
    ctx.ellipse(points.center.x, points.center.y - 1, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 地面层：逐格绘制整个园区底板
function drawGround() {
  drawGroundShadow();

  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      drawTileSurface(x, y);
    }
  }
}

// 道路装饰层：给道路补一点分隔线和细节
function drawRoadDecorations() {
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      if (!isRoadCell(x, y)) {
        continue;
      }

      const point = gridToScreen(x, y);

      if ((x + y) % 3 === 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(point.x - 6, point.y);
        ctx.lineTo(point.x + 6, point.y);
        ctx.stroke();
      }
    }
  }
}

// 绿化层：在非道路、非建筑区域绘制树木和绿化带
function drawGreenBelts() {
  for (let y = 0; y < gridRows; y += 1) {
    for (let x = 0; x < gridCols; x += 1) {
      if (isRoadCell(x, y) || isObstacleCell(x, y)) {
        continue;
      }

      if ((x + y) % 4 !== 1) {
        continue;
      }

      const point = gridToScreen(x, y, 18);
      const trunk = gridToScreen(x, y, 6);

      ctx.strokeStyle = "#5e4330";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(trunk.x, trunk.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();

      ctx.fillStyle = "#73d58d";
      ctx.beginPath();
      ctx.arc(point.x, point.y - 2, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#4fa96e";
      ctx.beginPath();
      ctx.arc(point.x - 4, point.y + 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 建筑块绘制：用顶部、左侧、右侧三个面组成一个立体建筑
function drawBuilding(x, y, levels = 3, palette = {}) {
  const height = levels * 18;
  const base = getTilePoints(x, y);
  const top = getTilePoints(x, y, height);

  const roofColor = palette.roof || "#9db2c9";
  const leftColor = palette.left || "#65788e";
  const rightColor = palette.right || "#8299b1";

  fillPolygon([top.top, top.right, base.right, base.top], rightColor);
  fillPolygon([top.top, top.left, base.left, base.top], leftColor);
  fillPolygon(
    [top.top, top.right, top.bottom, top.left],
    roofColor,
    "rgba(16, 32, 48, 0.22)"
  );

  ctx.fillStyle = "rgba(200, 236, 255, 0.4)";
  ctx.fillRect(top.center.x - 6, top.center.y - 7, 12, 4);
}

// 建筑层：包含障碍物建筑和几个额外的园区楼宇
function drawBuildings() {
  obstacles.forEach((item, index) => {
    drawBuilding(item.x, item.y, 3 + (index % 2), {
      roof: index % 2 === 0 ? "#9cb8d2" : "#b7c6d9",
      left: index % 2 === 0 ? "#6c8398" : "#76869a",
      right: index % 2 === 0 ? "#8ea6be" : "#96a8bd"
    });
  });

  drawBuilding(15, 8, 4, {
    roof: "#b9cfdf",
    left: "#748a98",
    right: "#94aebe"
  });
  drawBuilding(16, 8, 3, {
    roof: "#adc5d7",
    left: "#6e8897",
    right: "#8aa6b7"
  });
  drawBuilding(2, 9, 3, {
    roof: "#a8c0cf",
    left: "#6d8290",
    right: "#88a0b1"
  });
}

// 园区边界：给整个地图加一个可视化边框
function drawParkBorder() {
  const top = gridToScreen(0, 0);
  const right = gridToScreen(gridCols - 1, 0);
  const bottom = gridToScreen(gridCols - 1, gridRows - 1);
  const left = gridToScreen(0, gridRows - 1);

  ctx.strokeStyle = "rgba(134, 208, 255, 0.24)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y - scene.tileHeight / 2);
  ctx.lineTo(right.x + scene.tileWidth / 2, right.y);
  ctx.lineTo(bottom.x, bottom.y + scene.tileHeight / 2);
  ctx.lineTo(left.x - scene.tileWidth / 2, left.y);
  ctx.closePath();
  ctx.stroke();
}

// 路径层：绘制后台调度给当前任务规划出的路径
function drawPath() {
  if (!currentPath.length) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#59d4ff";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = 12;
  ctx.shadowColor = "rgba(89, 212, 255, 0.45)";
  ctx.beginPath();

  currentPath.forEach((point, index) => {
    const center = gridToScreen(point.x, point.y, 10);

    if (index === 0) {
      ctx.moveTo(center.x, center.y);
    } else {
      ctx.lineTo(center.x, center.y);
    }
  });

  ctx.stroke();
  ctx.shadowBlur = 0;

  currentPath.forEach((point, index) => {
    const center = gridToScreen(point.x, point.y, 10);
    ctx.fillStyle = index === 0 ? "#6cffb2" : "#8fe9ff";
    ctx.beginPath();
    ctx.arc(center.x, center.y, index === 0 ? 5 : 3.6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

// 订单标识层：绘制当前未完成订单的起点和终点标记
function drawOrderMarkers() {
  orders
    .filter((order) => order.status !== "completed")
    .forEach((order) => {
      const start = gridToScreen(order.start_point.x, order.start_point.y, 22);
      const end = gridToScreen(order.end_point.x, order.end_point.y, 22);

      ctx.strokeStyle = "rgba(115, 255, 189, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y + 10);
      ctx.lineTo(start.x, start.y - 10);
      ctx.stroke();

      ctx.fillStyle = "#3ddc97";
      ctx.beginPath();
      ctx.arc(start.x, start.y - 14, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 120, 120, 0.85)";
      ctx.beginPath();
      ctx.moveTo(end.x, end.y + 10);
      ctx.lineTo(end.x, end.y - 10);
      ctx.stroke();

      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(end.x, end.y - 14, 5, 0, Math.PI * 2);
      ctx.fill();
    });
}

// 小车造型：用简单几何图形拼一个 2.5D 运输小车
function drawCartBody(center, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - 12);
  ctx.lineTo(center.x + 12, center.y - 4);
  ctx.lineTo(center.x, center.y + 4);
  ctx.lineTo(center.x - 12, center.y - 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(8, 17, 29, 0.86)";
  ctx.beginPath();
  ctx.arc(center.x - 6, center.y + 3, 3, 0, Math.PI * 2);
  ctx.arc(center.x + 6, center.y + 3, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d8f4ff";
  ctx.fillRect(center.x - 4, center.y - 11, 8, 4);
}

// 小车层：把所有小车当前位置渲染到地图上
function drawCarts() {
  carts.forEach((cart) => {
    const center = gridToScreen(cart.x, cart.y, 22);
    const isIdle = cart.status === "idle";

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = isIdle ? "rgba(120, 255, 214, 0.45)" : "rgba(255, 180, 84, 0.55)";
    drawCartBody(center, isIdle ? "#78ffd6" : "#ffb454");
    ctx.restore();

    ctx.fillStyle = "#e8f3ff";
    ctx.font = '12px "Segoe UI"';
    ctx.textAlign = "center";
    ctx.fillText(cart.name, center.x, center.y - 18);
    ctx.textAlign = "start";
  });
}

// 地图文字标签：辅助说明建筑区和道路区
function drawSceneLabels() {
  ctx.fillStyle = "rgba(232, 243, 255, 0.72)";
  ctx.font = '13px "Segoe UI"';
  ctx.fillText("建筑区 A", gridToScreen(5, 5, 88).x - 12, gridToScreen(5, 5, 88).y);
  ctx.fillText("综合楼", gridToScreen(15, 8, 96).x - 10, gridToScreen(15, 8, 96).y);
  ctx.fillText("中心道路", gridToScreen(9, 6, 18).x - 16, gridToScreen(9, 6, 18).y);
}

// 地图总渲染入口：按图层顺序依次绘制背景、地面、建筑、路径、订单和小车
function drawMap() {
  drawBackground();
  drawGround();
  drawRoadDecorations();
  drawGreenBelts();
  drawBuildings();
  drawPath();
  drawOrderMarkers();
  drawCarts();
  drawParkBorder();
  drawSceneLabels();
}

// 空状态渲染：当列表没有数据时给用户一个明确提示
function renderEmptyState(target, text) {
  target.innerHTML = `<li class="empty-text">${text}</li>`;
}

// 消息区渲染：把 systemMessages 里的内容显示到右侧面板
function renderMessageList() {
  const messageList = document.getElementById("messageList");
  messageList.innerHTML = "";

  if (!systemMessages.length) {
    renderEmptyState(messageList, "后台调度系统已启动，等待新订单。");
    return;
  }

  systemMessages.forEach((message) => {
    const item = document.createElement("li");
    item.className = "message-item";
    item.innerHTML = `
      <p class="message-item__text">${message.text}</p>
      <p class="message-item__time">${message.time}</p>
    `;
    messageList.appendChild(item);
  });
}

// 顶部统计区渲染：展示订单总量、执行中数量、已完成数量和空闲车数量
function renderOverview() {
  const totalOrders = orders.length;
  const activeOrders = orders.filter((order) => ["assigned", "delivering"].includes(order.status)).length;
  const completedOrders = orders.filter((order) => order.status === "completed").length;
  const idleCartCount = carts.filter((cart) => cart.status === "idle").length;

  document.getElementById("totalOrders").textContent = totalOrders;
  document.getElementById("activeOrders").textContent = activeOrders;
  document.getElementById("completedOrders").textContent = completedOrders;
  document.getElementById("idleCarts").textContent = idleCartCount;
  document.getElementById("systemStatusText").textContent =
    activeOrders > 0 ? "后台自动配送中" : "后台待命中";
  document.getElementById("lastUpdatedText").textContent = `最近刷新时间：${formatTime()}`;
  document.getElementById("mapSummary").textContent =
    `当前共有 ${carts.length} 台小车，执行中订单 ${activeOrders} 个，已完成 ${completedOrders} 个。`;
  document.getElementById("cartPositionTag").textContent = `在线小车 ${carts.length} 台`;
  document.getElementById("orderPositionTag").textContent = `执行订单 ${activeOrders} 个`;
}

// 当前任务卡片渲染：展示当前系统最重要的一条订单
function renderCurrentTaskCard() {
  const currentOrder = getCurrentOrder();
  const assignedCart = currentOrder
    ? carts.find((cart) => cart.id === currentOrder.assigned_cart_id)
    : null;

  document.getElementById("currentOrderId").textContent = currentOrder ? `#${currentOrder.id}` : "暂无";
  document.getElementById("currentOrderStart").textContent = currentOrder
    ? `(${currentOrder.start_point.x}, ${currentOrder.start_point.y})`
    : "-";
  document.getElementById("currentOrderEnd").textContent = currentOrder
    ? `(${currentOrder.end_point.x}, ${currentOrder.end_point.y})`
    : "-";
  document.getElementById("currentOrderStatus").textContent = currentOrder
    ? getStatusText(currentOrder.status)
    : "无任务";
  document.getElementById("currentOrderCart").textContent = assignedCart
    ? assignedCart.name
    : "待分配";
}

// 小车状态卡片渲染：展示主小车信息，并列出所有小车摘要
function renderCartStatusCard() {
  const currentCart = getCurrentCart();
  const fleetList = document.getElementById("fleetList");

  document.getElementById("activeCartName").textContent = currentCart ? currentCart.name : "暂无";
  document.getElementById("activeCartPosition").textContent = currentCart
    ? `(${currentCart.x}, ${currentCart.y})`
    : "-";
  document.getElementById("activeCartStatus").textContent = currentCart
    ? getStatusText(currentCart.status)
    : "未知";

  fleetList.innerHTML = "";

  if (!carts.length) {
    renderEmptyState(fleetList, "当前没有小车数据。");
    return;
  }

  carts.forEach((cart) => {
    const item = document.createElement("li");
    item.className = "mini-list__item";
    item.innerHTML = `
      <div class="mini-list__head">
        <p class="mini-list__title">${cart.name}</p>
        <span class="info-row__value info-row__value--badge">${getStatusText(cart.status)}</span>
      </div>
      <p class="mini-list__meta">坐标：(${cart.x}, ${cart.y})</p>
      <p class="mini-list__meta">任务：${cart.current_order_id ? `#${cart.current_order_id}` : "无"}</p>
    `;
    fleetList.appendChild(item);
  });
}

// 右侧所有面板的统一刷新入口
function renderAllPanels() {
  renderOverview();
  renderCurrentTaskCard();
  renderCartStatusCard();
  renderMessageList();
}

// 从当前任务提取路径，用于地图高亮显示
function updateCurrentPath() {
  const currentOrder = getCurrentOrder();
  currentPath = currentOrder && Array.isArray(currentOrder.path) ? currentOrder.path : [];
}

// 数据请求层：分别从后端拉取小车和订单状态
async function loadCarts() {
  const response = await fetch("/api/carts");
  return response.json();
}

async function loadOrders() {
  const response = await fetch("/api/orders");
  return response.json();
}

// 状态变化检测：比较“上一次订单状态”和“这一次订单状态”，生成系统消息
function processStateChanges(previousOrders, latestOrders) {
  const previousOrderMap = new Map(previousOrders.map((order) => [order.id, order]));

  latestOrders.forEach((order) => {
    const previousOrder = previousOrderMap.get(order.id);

    if (!previousOrder) {
      addSystemMessage(
        order.source === "simulated"
          ? `仿真系统生成订单 #${order.id}。`
          : `收到手动创建订单 #${order.id}。`
      );
      return;
    }

    if (previousOrder.status === order.status) {
      return;
    }

    if (order.status === "assigned") {
      addSystemMessage(`订单 #${order.id} 已分配给小车 #${order.assigned_cart_id}。`);
    } else if (order.status === "delivering") {
      addSystemMessage(`订单 #${order.id} 开始配送。`);
    } else if (order.status === "completed") {
      addSystemMessage(`订单 #${order.id} 已完成配送。`);
    }
  });
}

// 页面主刷新函数：定时从后端拉数据，再统一重绘地图和面板
async function refreshData() {
  const previousOrders = orders.slice();
  const [latestCarts, latestOrders] = await Promise.all([loadCarts(), loadOrders()]);

  carts = latestCarts;
  orders = latestOrders;
  updateCurrentPath();

  if (!isFirstRefresh) {
    processStateChanges(previousOrders, latestOrders);
  }

  renderAllPanels();
  drawMap();
  isFirstRefresh = false;
}

// 手动创建订单事件：虽然系统支持自动仿真订单，但这里保留手动下单入口
document.getElementById("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const startX = Number(document.getElementById("startX").value);
  const startY = Number(document.getElementById("startY").value);
  const endX = Number(document.getElementById("endX").value);
  const endY = Number(document.getElementById("endY").value);

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      start_point: { x: startX, y: startY },
      end_point: { x: endX, y: endY }
    })
  });

  if (response.ok) {
    document.getElementById("orderForm").reset();
    await refreshData();
  } else {
    addSystemMessage("订单创建失败。");
  }
});

// 页面初始化：先写入一条启动消息，然后开始首次刷新和定时刷新
addSystemMessage("后台调度系统已启动。");
refreshData();
setInterval(refreshData, refreshIntervalMs);
