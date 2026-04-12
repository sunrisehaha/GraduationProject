const canvas = document.getElementById("parkCanvas");
const ctx = canvas.getContext("2d");

const gridCols = 20;
const gridRows = 12;
const cellSize = 40;

const obstacles = [
  { x: 5, y: 5 },
  { x: 5, y: 6 },
  { x: 5, y: 7 },
  { x: 12, y: 3 },
  { x: 12, y: 4 }
];

let carts = [];
let orders = [];
let currentPath = [];
let moveTimer = null;
let isAnimating = false;

function formatTime() {
  return new Date().toLocaleString("zh-CN", {
    hour12: false
  });
}

function getCartBadgeClass(status) {
  return status === "idle" ? "badge badge--idle" : "badge badge--active";
}

function getOrderBadgeClass(status) {
  if (status === "pending") {
    return "badge badge--pending";
  }

  if (status === "done" || status === "completed") {
    return "badge badge--done";
  }

  return "badge badge--other";
}

function getStatusText(status) {
  const statusMap = {
    idle: "空闲",
    pending: "待处理",
    done: "已完成",
    completed: "已完成"
  };

  return statusMap[status] || status;
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#08131f");
  gradient.addColorStop(1, "#0c2134");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
  ctx.lineWidth = 1;

  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      ctx.strokeStyle = "rgba(143, 196, 255, 0.15)";
      ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  ctx.fillStyle = "rgba(143, 196, 255, 0.55)";
  ctx.font = '12px "Segoe UI"';

  for (let x = 0; x < gridCols; x++) {
    ctx.fillText(String(x), x * cellSize + 14, 16);
  }

  for (let y = 0; y < gridRows; y++) {
    ctx.fillText(String(y), 4, y * cellSize + 26);
  }
}

function drawObstacles() {
  obstacles.forEach((obs) => {
    const drawX = obs.x * cellSize;
    const drawY = obs.y * cellSize;

    ctx.fillStyle = "#5f7086";
    ctx.fillRect(drawX + 4, drawY + 4, cellSize - 8, cellSize - 8);
    ctx.strokeStyle = "rgba(255, 180, 84, 0.5)";
    ctx.strokeRect(drawX + 4, drawY + 4, cellSize - 8, cellSize - 8);
  });
}

function drawPath() {
  if (!currentPath.length) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#48c7ff";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = 12;
  ctx.shadowColor = "rgba(72, 199, 255, 0.45)";

  ctx.beginPath();

  currentPath.forEach((point, index) => {
    const centerX = point.x * cellSize + cellSize / 2;
    const centerY = point.y * cellSize + cellSize / 2;

    if (index === 0) {
      ctx.moveTo(centerX, centerY);
    } else {
      ctx.lineTo(centerX, centerY);
    }
  });

  ctx.stroke();
  ctx.shadowBlur = 0;

  currentPath.forEach((point) => {
    const centerX = point.x * cellSize + cellSize / 2;
    const centerY = point.y * cellSize + cellSize / 2;

    ctx.fillStyle = "#8ae7ff";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawOrderMarkers() {
  orders.forEach((order) => {
    const startX = order.start_point.x * cellSize + cellSize / 2;
    const startY = order.start_point.y * cellSize + cellSize / 2;
    const endX = order.end_point.x * cellSize + cellSize / 2;
    const endY = order.end_point.y * cellSize + cellSize / 2;

    ctx.strokeStyle = "rgba(72, 199, 255, 0.24)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#3ddc97";
    ctx.beginPath();
    ctx.arc(startX, startY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawCarts() {
  carts.forEach((cart) => {
    const centerX = cart.x * cellSize + cellSize / 2;
    const centerY = cart.y * cellSize + cellSize / 2;
    const isIdle = cart.status === "idle";

    ctx.shadowBlur = 20;
    ctx.shadowColor = isIdle ? "rgba(120, 255, 214, 0.55)" : "rgba(255, 180, 84, 0.6)";
    ctx.fillStyle = isIdle ? "#78ffd6" : "#ffb454";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#03121e";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e8f3ff";
    ctx.font = '12px "Segoe UI"';
    ctx.fillText(cart.name, cart.x * cellSize + 4, cart.y * cellSize + 36);
  });
}

function drawMap() {
  drawBackground();
  drawGrid();
  drawObstacles();
  drawPath();
  drawOrderMarkers();
  drawCarts();
}

function stopCartAnimation() {
  if (moveTimer) {
    clearInterval(moveTimer);
    moveTimer = null;
  }

  isAnimating = false;
}

function moveCartAlongPath(path) {
  if (!Array.isArray(path) || !path.length) {
    return;
  }

  if (!carts.length || !carts[0]) {
    return;
  }

  stopCartAnimation();
  isAnimating = true;

  let stepIndex = 0;
  carts[0].status = "moving";

  moveTimer = setInterval(() => {
    const nextPoint = path[stepIndex];

    if (!nextPoint) {
      carts[0].status = "idle";
      stopCartAnimation();
      drawMap();
      renderCartList();
      renderOverview();
      return;
    }

    carts[0].x = nextPoint.x;
    carts[0].y = nextPoint.y;
    drawMap();
    renderCartList();
    renderOverview();

    stepIndex += 1;

    if (stepIndex >= path.length) {
      carts[0].status = "idle";
      stopCartAnimation();
      drawMap();
      renderCartList();
      renderOverview();
    }
  }, 500);
}

function startDelivery() {
  if (!currentPath.length) {
    return;
  }

  if (!carts.length || !carts[0]) {
    return;
  }

  moveCartAlongPath(currentPath);
}

function renderEmptyState(target, text) {
  target.innerHTML = `<li class="empty-text">${text}</li>`;
}

function renderOverview() {
  const totalCarts = carts.length;
  const activeCarts = carts.filter((cart) => cart.status !== "idle").length;
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((order) => order.status === "pending").length;

  document.getElementById("totalCarts").textContent = totalCarts;
  document.getElementById("activeCarts").textContent = activeCarts;
  document.getElementById("totalOrders").textContent = totalOrders;
  document.getElementById("pendingOrders").textContent = pendingOrders;

  document.getElementById("systemStatusText").textContent =
    activeCarts > 0 || pendingOrders > 0 ? "系统运行中" : "系统空闲中";
  document.getElementById("lastUpdatedText").textContent = `最近刷新时间：${formatTime()}`;
  document.getElementById("mapSummary").textContent =
    `当前监控 ${totalCarts} 台小车，待处理订单 ${pendingOrders} 个。`;
  document.getElementById("cartPositionTag").textContent = `在线小车 ${totalCarts} 台`;
  document.getElementById("orderPositionTag").textContent = `订单标记 ${totalOrders * 2} 个`;
}

function renderCartList() {
  const cartList = document.getElementById("cartList");
  cartList.innerHTML = "";

  if (!carts.length) {
    renderEmptyState(cartList, "当前没有可展示的小车数据。");
    return;
  }

  carts.forEach((cart) => {
    const li = document.createElement("li");
    li.className = "data-item";
    li.innerHTML = `
      <div class="data-item__head">
        <p class="data-item__title">${cart.name}</p>
        <span class="${getCartBadgeClass(cart.status)}">${getStatusText(cart.status)}</span>
      </div>
      <div class="data-item__meta">
        <span>编号：#${cart.id}</span>
        <span>坐标：(${cart.x}, ${cart.y})</span>
      </div>
    `;
    cartList.appendChild(li);
  });
}

function renderOrderList() {
  const orderList = document.getElementById("orderList");
  orderList.innerHTML = "";

  if (!orders.length) {
    renderEmptyState(orderList, "当前没有订单，右侧表单可直接创建。");
    return;
  }

  orders
    .slice()
    .reverse()
    .forEach((order) => {
      const li = document.createElement("li");
      li.className = "data-item";
      li.innerHTML = `
        <div class="data-item__head">
          <p class="data-item__title">订单 #${order.id}</p>
          <span class="${getOrderBadgeClass(order.status)}">${getStatusText(order.status)}</span>
        </div>
        <div class="data-item__meta">
          <span>起点：(${order.start_point.x}, ${order.start_point.y})</span>
          <span>终点：(${order.end_point.x}, ${order.end_point.y})</span>
        </div>
        <p class="data-item__time">创建时间：${order.create_time || "暂无记录"}</p>
      `;
      orderList.appendChild(li);
    });
}

async function loadCarts() {
  const response = await fetch("/api/carts");
  carts = await response.json();
}

async function loadOrders() {
  const response = await fetch("/api/orders");
  orders = await response.json();
}

async function loadCurrentPath() {
  if (!orders.length) {
    currentPath = [];
    return;
  }

  const firstOrder = orders[0];
  const response = await fetch("/api/path", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      start: firstOrder.start_point,
      end: firstOrder.end_point
    })
  });

  if (!response.ok) {
    currentPath = [];
    return;
  }

  const data = await response.json();
  currentPath = Array.isArray(data.path) ? data.path : [];
}

async function refreshData() {
  if (!isAnimating) {
    await loadCarts();
  }

  await loadOrders();
  await loadCurrentPath();
  renderOverview();
  renderCartList();
  renderOrderList();
  drawMap();
}

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
    await refreshData();
    document.getElementById("orderForm").reset();
  } else {
    alert("订单创建失败。");
  }
});

canvas.addEventListener("click", () => {
  startDelivery();
});

refreshData();
setInterval(refreshData, 5000);
