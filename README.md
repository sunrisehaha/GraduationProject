# 智慧园区快递配送系统

一个面向毕业设计场景的园区配送演示项目：左侧是 2.5D 园区地图，右侧是订单历史与交互面板，后台持续模拟订单生成、自动调度小车、推进配送过程，并把状态通过 ORM 和数据库保留下来。

## 导航
- [项目亮点](#项目亮点)
- [界面预览](#界面预览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心业务流](#核心业务流)
- [从零构建理解路线](#从零构建理解路线)
- [快速启动](#快速启动)
- [数据库与迁移](#数据库与迁移)
- [重要文件导航](#重要文件导航)
- [后续可扩展方向](#后续可扩展方向)

## 项目亮点
- 园区地图不只是静态背景，而是会随着订单、小车、路径一起刷新。
- 订单不再只是“当前状态”，还记录了事件时间线，便于回看配送过程。
- 前端界面聚焦“一屏看全局”，减少长侧栏滚动，把地图放回主视觉。
- 后端已经走 ORM 路线，后续新增表、字段、事件记录都更顺。

## 界面预览
当前界面分成三块：

1. 顶部总览区  
   展示系统状态、刷新时间、订单和小车的整体统计。

2. 左侧主区  
   [园区配送地图](./frontend/src/components/map/ParkMap.vue) 负责承接主视觉，旁边和下方配合当前任务与车队状态。

3. 右侧交互区  
   [创建订单卡片](./frontend/src/components/panels/CreateOrderCard.vue)、[订单历史卡片](./frontend/src/components/panels/OrderHistoryCard.vue)、[系统日志卡片](./frontend/src/components/panels/SystemLogCard.vue) 负责输入、回看和反馈。

整体风格走的是“清爽的浅色科技看板”，希望保留一点园区调度中心的精密感，但不让人长时间盯着页面时觉得压抑。

## 技术栈
### 前端
- Vue 3
- Vite
- Composition API
- Canvas 2D / Three.js 园区地图展示

### 后端
- Flask
- Flask-SQLAlchemy
- Flask-Migrate

### 数据层
- SQLite
- Alembic 迁移

## 项目结构
```text
GraduationProject/
├── app.py                     # 根启动入口，保持 python app.py 的使用方式
├── backend/
│   ├── app.py                 # Flask 应用入口、接口注册、前端资源托管
│   ├── astar.py               # A* 路径规划
│   ├── config.py              # 数据库配置
│   ├── extensions.py          # db / migrate 扩展初始化
│   ├── runtime.py             # 地图尺寸、障碍物、线程锁
│   ├── scheduler.py           # 后台线程循环入口
│   ├── models/                # ORM 模型定义
│   └── services/              # 业务服务层
├── frontend/
│   ├── src/views/             # 页面视图
│   ├── src/components/        # 布局、地图、卡片组件
│   ├── src/composables/       # 页面状态与地图渲染逻辑
│   └── src/styles/            # 全局样式
├── migrations/                # 数据库迁移记录
└── data/                      # 本地数据库与示例数据
```

## 核心业务流
### 1. 创建订单
用户在 [创建订单卡片](./frontend/src/components/panels/CreateOrderCard.vue) 输入起点和终点，前端调用 [订单接口模块](./frontend/src/api/orders.js)，后端再通过 [订单服务](./backend/services/order_service.py) 写入订单主表、点位表和事件表。

### 2. 自动调度
[调度线程](./backend/scheduler.py) 会持续运行，真正的调度决策写在 [dispatch_service.py](./backend/services/dispatch_service.py)：
- 找待调度订单
- 计算每辆空闲小车的路径长度
- 按最近原则分配小车

### 3. 路径规划
[astar.py](./backend/astar.py) 用 A* 算法在 20 x 12 的地图网格上规划路径，避开障碍物区域。

### 4. 状态回放
订单状态变化会写入 [订单事件表](./backend/models/order_event.py)，前端在历史卡片中直接展示这些事件，形成一条“配送时间线”。

## 从零构建理解路线
如果从零开始做这个项目，最稳的顺序不是先做页面，而是先做业务闭环：

```text
地图规则
  ↓
路径规划
  ↓
数据模型
  ↓
订单创建
  ↓
自动调度
  ↓
小车移动
  ↓
查询接口
  ↓
前端轮询
  ↓
看板展示
  ↓
地图视觉升级
```

### 1. 先定义世界规则
先确定园区是一个 `20 x 12` 网格，哪些格子是障碍物，小车和订单点位都在这个网格里表达。

对应文件：[runtime.py](./backend/runtime.py)

### 2. 再实现路径规划
用 A* 根据起点、终点和障碍物算出一条路径。这里先不考虑订单和页面，只解决“怎么从 A 点走到 B 点”。

对应文件：[astar.py](./backend/astar.py)

### 3. 再设计最小数据模型
系统至少要记住订单、小车、订单点位和订单事件。订单负责业务状态，小车负责当前位置和当前路径。

对应目录：[models](./backend/models/)

### 4. 再做订单创建
前端提交起点和终点，后端创建一条 `pending` 订单。此时系统只是能接收任务，还没有自动调度。

对应文件：[order_service.py](./backend/services/order_service.py)

### 5. 再做调度逻辑
调度器扫描 `pending` 订单，找到空闲小车，计算完整路径，并把订单分给路径最短的小车。

对应文件：[dispatch_service.py](./backend/services/dispatch_service.py)

### 6. 再做后台推进
后台线程定时做三件事：分配订单、推动小车前进一步、生成仿真订单。这样系统不用手动点击也能持续运行。

对应文件：[scheduler.py](./backend/scheduler.py)

### 7. 再做后端接口
前端需要通过接口拿到订单、小车和路径数据，所以 Flask 负责把业务服务包装成 HTTP 接口。

对应文件：[backend/app.py](./backend/app.py)

### 8. 再做前端数据中心
前端每秒轮询后端，把原始订单和小车整理成当前任务、当前路径、统计数字和历史列表。

对应文件：[useDashboardData.js](./frontend/src/composables/useDashboardData.js)

### 9. 再做基础看板
页面先把核心信息展示清楚：顶部统计、当前任务、订单创建、订单历史、车队状态和地图区域。

对应文件：[DashboardView.vue](./frontend/src/views/DashboardView.vue)

### 10. 最后做地图视觉升级
地图只是展示层。业务数据已经跑通后，再从基础地图升级到 Three.js 场景，避免一开始就被视觉复杂度拖住。

对应文件：[ParkMap.vue](./frontend/src/components/map/ParkMap.vue)、[useThreeMapScene.js](./frontend/src/composables/useThreeMapScene.js)

## 快速启动
### 1. 安装依赖
```bash
pip install -r requirements.txt
cd frontend
npm install
cd ..
```

### 2. 启动项目
```bash
python app.py
```

默认会在本地启动 Flask 服务，并托管 `frontend/dist` 下的前端资源。

### 3. 前端开发构建
如果你修改了 Vue 页面，需要重新打包：

```bash
cd frontend
npm run build
```

## 数据库与迁移
### ORM 模型入口
- [订单主表模型](./backend/models/order.py)
- [订单点位模型](./backend/models/order_point.py)
- [订单事件模型](./backend/models/order_event.py)
- [小车模型](./backend/models/cart.py)

### 常用迁移命令
```bash
flask --app app db migrate -m "描述这次表结构变化"
flask --app app db upgrade
```

### 本地数据库文件
数据库默认在：

```text
data/project.db
```

如果只是提交代码，通常只需要提交模型和迁移，不需要提交数据库运行产物。

## 重要文件导航
- [应用入口](./backend/app.py)
- [调度循环](./backend/scheduler.py)
- [订单服务](./backend/services/order_service.py)
- [调度服务](./backend/services/dispatch_service.py)
- [页面状态中心](./frontend/src/composables/useDashboardData.js)
- [地图渲染模块](./frontend/src/composables/useMapScene.js)
- [看板页面](./frontend/src/views/DashboardView.vue)
- [项目协作说明](./AGENTS.md)

## 后续可扩展方向
- 订单取消
- 订单筛选接口进一步细化
- 小车维护 / 离线状态
- 订单详情独立页面
- 多种调度策略对比
- 历史统计图表

---

如果你刚接触这个项目，最推荐的阅读顺序是：

1. 先看 [README](./README.md)
2. 再看 [DashboardView.vue](./frontend/src/views/DashboardView.vue)
3. 然后看 [useDashboardData.js](./frontend/src/composables/useDashboardData.js)
4. 最后回到后端的 [order_service.py](./backend/services/order_service.py) 和 [dispatch_service.py](./backend/services/dispatch_service.py)

这样会比一开始就扎进 ORM 或调度线程里更容易理解全局。
