# 智慧园区快递配送系统

这是一个面向毕业设计展示的智慧园区快递配送系统。

项目用一个可视化看板串起完整业务链：用户创建配送订单，后端根据园区道路和小车位置自动调度车辆，通过 A* 算法规划路径，再持续推进小车移动，并把订单状态、调度过程和事件历史记录到数据库中。

![系统界面预览](./frontend/public/preview/dashboard.png)

## 项目现在能做什么

- 展示 3D 风格园区地图，地图上能看到道路、建筑、业务点位和配送小车。
- 支持手动创建订单，选择真实园区业务点作为起点，输入楼栋或地址作为终点。
- 后台自动扫描待配送订单，把订单分配给最近且可达的空闲小车。
- 使用 A* 算法在园区网格中规划路径，避开建筑和禁行区。
- 小车会沿路径逐步移动，订单状态会从待调度推进到已分配、配送中、已完成。
- 记录订单事件时间线，方便在订单历史中回看配送过程。
- 提供演示控制面板，答辩时可以重置场景、创建 1 单演示或 5 单并行演示。
- 展示调度解释，说明系统为什么选择某辆小车，而不是只给一个分配结果。

## 核心业务流程

```text
创建订单
  ↓
保存订单、起终点和订单事件
  ↓
调度器扫描待处理订单
  ↓
计算每辆空闲小车到取件点的路径
  ↓
选择最近且可达的小车
  ↓
规划完整配送路径
  ↓
后台线程推动小车移动
  ↓
订单状态和事件持续更新
  ↓
前端轮询接口并刷新看板
```

这条链路是项目的主线。页面效果、数据库设计和调度逻辑都是围绕它展开的。

## 技术栈

### 前端

- Vue 3
- Vite
- Composition API
- Three.js

### 后端

- Flask
- Flask-SQLAlchemy
- Flask-Migrate

### 数据库

- SQLite
- Alembic 数据库迁移

## 项目结构

```text
GraduationProject/
├── app.py                         # 根启动入口，保留 python app.py 的启动方式
├── backend/
│   ├── app.py                     # Flask 应用、接口注册、前端资源托管
│   ├── astar.py                   # A* 路径规划
│   ├── campus_rules.py            # 读取统一园区规则
│   ├── runtime.py                 # 运行时地图规则、锁和演示状态
│   ├── scheduler.py               # 后台调度线程入口
│   ├── models/                    # ORM 模型
│   └── services/                  # 订单、调度、小车和演示业务逻辑
├── frontend/
│   ├── src/views/                 # 页面入口
│   ├── src/components/            # 地图、看板卡片和布局组件
│   ├── src/composables/           # 前端状态、地图渲染和业务数据整理
│   ├── src/api/                   # 后端接口封装
│   └── public/scene/              # 3D 场景和地图静态资源
├── shared/
│   └── campus_rules.json          # 前后端共用的园区世界规则
├── migrations/                    # 数据库迁移文件
└── requirements.txt               # Python 依赖
```

## 关键设计

### 1. 园区规则统一

园区地图不是前端和后端各写一份。

[shared/campus_rules.json](./shared/campus_rules.json) 统一保存地图尺寸、建筑禁行区、道路、业务点位、默认小车和演示订单。后端通过 [campus_rules.py](./backend/campus_rules.py) 读取这份规则，前端也基于同一套规则展示业务地图。

这样做的好处是：地图展示、路径规划和演示订单不会互相打架。

### 2. 后端按业务分层

路由层主要负责接收请求和返回 JSON，真正的业务逻辑放在 `backend/services/`：

- [order_service.py](./backend/services/order_service.py)：订单创建、查询、状态更新、事件记录。
- [dispatch_service.py](./backend/services/dispatch_service.py)：订单分配、小车推进、调度解释。
- [cart_service.py](./backend/services/cart_service.py)：小车查询、重置和状态维护。
- [demo_service.py](./backend/services/demo_service.py)：答辩演示场景控制。

这样比把所有逻辑塞进 Flask 路由函数里更清楚，也更方便讲解。

### 3. 调度策略简单但可解释

当前调度策略是“最近空闲车优先”：

1. 找出所有待调度订单。
2. 遍历全部小车。
3. 跳过正在执行任务的小车。
4. 计算空闲小车到取件点的路径长度。
5. 选择路径最短且可达的小车。
6. 保存候选小车比较结果，供前端展示调度解释。

这不是最复杂的算法，但适合毕业设计：规则清楚、结果可验证、容易扩展成多策略对比。

### 4. 前端看板只展示整理后的状态

页面入口是 [DashboardView.vue](./frontend/src/views/DashboardView.vue)，但它不直接写复杂数据逻辑。

主要状态收敛在 [useDashboardData.js](./frontend/src/composables/useDashboardData.js)：

- 每秒轮询订单、小车、演示状态和调度解释。
- 整理顶部统计数字。
- 选出当前最重要的任务。
- 生成订单历史、车队状态和系统日志。
- 把后端原始状态翻译成页面可读的中文。

地图组件 [ParkMap.vue](./frontend/src/components/map/ParkMap.vue) 只负责展示地图、小车和当前路径。

## 快速启动

### 1. 安装后端依赖

```bash
pip install -r requirements.txt
```

### 2. 安装并构建前端

```bash
cd frontend
npm install
npm run build
cd ..
```

### 3. 启动项目

```bash
python app.py
```

访问地址：

```text
http://127.0.0.1:5001
```

## 开发时常用命令

如果只改后端，直接重启：

```bash
python app.py
```

如果改了前端页面，需要重新构建：

```bash
cd frontend
npm run build
cd ..
python app.py
```

如果需要生成数据库迁移：

```bash
flask --app app db migrate -m "描述这次表结构变化"
flask --app app db upgrade
```

## 数据库说明

项目默认使用 SQLite，数据库文件位于：

```text
data/project.db
```

主要模型：

- [Order](./backend/models/order.py)：订单主表，记录订单编号、状态、来源、分配小车和路径。
- [OrderPoint](./backend/models/order_point.py)：订单起点和终点。
- [OrderEvent](./backend/models/order_event.py)：订单事件时间线。
- [Cart](./backend/models/cart.py)：配送小车状态、当前位置和当前路径。

数据库运行文件不应该提交到仓库，迁移文件和模型代码才是需要保留的内容。

## 推荐阅读顺序

如果是第一次看这个项目，建议按这个顺序读：

1. [shared/campus_rules.json](./shared/campus_rules.json)：先理解园区世界规则。
2. [backend/astar.py](./backend/astar.py)：再看路径是怎么规划出来的。
3. [backend/models/](./backend/models/)：理解系统需要保存哪些数据。
4. [backend/services/order_service.py](./backend/services/order_service.py)：看订单如何创建和记录事件。
5. [backend/services/dispatch_service.py](./backend/services/dispatch_service.py)：看小车如何接单和移动。
6. [frontend/src/composables/useDashboardData.js](./frontend/src/composables/useDashboardData.js)：看前端如何整理后端数据。
7. [frontend/src/views/DashboardView.vue](./frontend/src/views/DashboardView.vue)：最后看页面如何组织各个组件。

## 后续可以扩展什么

- 订单取消和重新调度。
- 小车离线、维护、载重等状态。
- 多种调度策略对比，例如最近距离、最少任务、优先级订单。
- 订单统计图表，例如完成时长、每日订单量、小车利用率。
- 独立订单详情页。
- 更完整的权限和后台管理页面。

## 一句话总结

这个项目的重点不是堆页面，而是把“园区规则、订单创建、自动调度、路径规划、小车移动、状态回放”串成一条能运行、能展示、也能讲清楚的业务闭环。
