# AGENTS.md

这份文件给参与本仓库的 AI 代理和协作者使用。

项目目标不是“堆功能”，而是把智慧园区快递配送系统做成一条能运行、能展示、能讲清楚的业务链：订单创建、自动调度、路径规划、小车移动、状态回放。

## 1. 沟通方式

- 默认使用中文回复，除非用户明确要求英文。
- 说话直接、简洁、基于事实，不要写客套话和空泛鼓励。
- 用户如果判断错了，要直接指出原因，并给出更稳的做法。
- 解释代码时面向“已经懂一点，但体系还没完全建立”的读者。
- 任务结束时只做简短总结，说清楚改了什么、验证了什么、还有什么没做。
- 涉及本地文件时，使用可点击 Markdown 链接，例如 [README.md](/Users/sunkezan/Desktop/GraduationProject/README.md)。

## 2. 做事方式

- 先读代码再下结论。不要凭记忆猜当前结构。
- 能用 `rg` 就用 `rg`，不要优先用慢而散的搜索方式。
- 遵循 KISS 原则，优先做简单、清楚、可维护的实现。
- 不为了“高级感”引入复杂抽象，不为了演示效果破坏业务逻辑。
- 较大改动先给文字版方案；简单、明确、低风险的改动可以直接实施。
- 用户要求只改前端时，不要改后端接口、数据库模型和 API。
- 不要创建文档，除非用户明确要求。本文件和 README 这类用户点名的文档除外。
- 改代码时优先保留现有风格和目录边界，不做顺手大重构。
- 不要回滚用户已有改动。发现工作区有无关改动时，忽略它；影响当前任务时，先读懂再处理。

## 3. 项目主线

这个项目的核心业务链是：

```text
创建订单
  ↓
保存起点、终点和订单事件
  ↓
后台调度器扫描待处理订单
  ↓
计算候选小车路径和综合成本
  ↓
选择合适小车并保存调度解释
  ↓
小车沿路径移动
  ↓
订单、车辆、事件日志持续更新
  ↓
前端驾驶舱展示当前状态和历史记录
```

任何新功能都应该服务这条主线，而不是只增加一个孤立页面或孤立按钮。

## 4. 当前目录事实

后端当前结构：

- [backend/api/](/Users/sunkezan/Desktop/GraduationProject/backend/api)：HTTP 接口和前端页面托管。
- [backend/business/](/Users/sunkezan/Desktop/GraduationProject/backend/business)：订单、调度、小车、演示等业务逻辑。
- [backend/campus/](/Users/sunkezan/Desktop/GraduationProject/backend/campus)：园区规则读取和 A* 路径规划。
- [backend/database/](/Users/sunkezan/Desktop/GraduationProject/backend/database)：ORM 模型。
- [backend/system/](/Users/sunkezan/Desktop/GraduationProject/backend/system)：配置、数据库扩展、运行时状态、后台线程。

前端当前结构：

- [frontend/src/api/](/Users/sunkezan/Desktop/GraduationProject/frontend/src/api)：前端请求封装。
- [frontend/src/campus/](/Users/sunkezan/Desktop/GraduationProject/frontend/src/campus)：Three.js 场景、业务地图、相机控制、小车动画。
- [frontend/src/dashboard/](/Users/sunkezan/Desktop/GraduationProject/frontend/src/dashboard)：驾驶舱页面、模块、面板和数据整理逻辑。
- [frontend/src/styles/](/Users/sunkezan/Desktop/GraduationProject/frontend/src/styles)：全局样式和组件样式。
- [shared/campus_rules.json](/Users/sunkezan/Desktop/GraduationProject/shared/campus_rules.json)：前后端共用的园区业务规则。

不要再按旧路径 `frontend/src/views`、`frontend/src/components`、`backend/services`、`backend/models` 规划新代码。

## 5. 前端习惯

- 地图是页面主视觉，不能被右侧或底部模块挤成普通后台卡片。
- 页面风格保持浅色科技感：清爽、轻盈、现代，不做大面积深色压迫感背景。
- 驾驶舱模块遵循“单一模块流”：
  - 调度控制台
  - 当前任务
  - 调度解释
  - 车队状态
  - 系统日志
  - 订单历史
  - 创建订单
- 模块可以收起、展开、拖拽排序；布局由 [useDashboardModuleLayout.js](/Users/sunkezan/Desktop/GraduationProject/frontend/src/dashboard/composables/useDashboardModuleLayout.js) 统一计算。
- 桌面端优先把模块放在地图右侧，右侧按地图高度放不下的模块自动流到地图下方。
- 窄屏端不要挤压地图，模块自然排到下方。
- 组件命名要直观，例如 `CurrentTaskCard.vue`、`OrderHistoryCard.vue`、`DashboardModuleShell.vue`。
- 状态整理优先放进 composable，例如 [useDashboardData.js](/Users/sunkezan/Desktop/GraduationProject/frontend/src/dashboard/composables/useDashboardData.js)。
- 保证原有按钮功能可用。视觉优化不能让创建订单、演示控制、订单选择等交互失效。
- 3D 地图交互逻辑优先放在 [frontend/src/campus/](/Users/sunkezan/Desktop/GraduationProject/frontend/src/campus)，不要散落在页面组件里。

## 6. 后端习惯

- 路由层只做请求接收、参数读取、响应返回。
- 业务逻辑放在 [backend/business/](/Users/sunkezan/Desktop/GraduationProject/backend/business)。
- ORM 模型放在 [backend/database/](/Users/sunkezan/Desktop/GraduationProject/backend/database)。
- 路径规划保持独立，集中在 [backend/campus/pathfinding.py](/Users/sunkezan/Desktop/GraduationProject/backend/campus/pathfinding.py)。
- 园区规则优先从 [shared/campus_rules.json](/Users/sunkezan/Desktop/GraduationProject/shared/campus_rules.json) 读取，不要前后端各写一套点位。
- 调度策略要可解释。当前核心是综合成本：

```text
综合成本 = 空驶距离 + 低电量惩罚 + 近期接单惩罚 - 长期未使用奖励
```

- 如果新增调度规则，要同步考虑前端“调度解释”能不能讲清楚。

## 7. 注释习惯

- 注释全部使用中文。
- 文件开头说明这个文件负责什么。
- 功能块前的注释说明“为什么存在”和“解决什么问题”，不要写废话。
- 遇到作者可能不熟的语法，要补解释型注释，尤其是：
  - `ref`
  - `computed`
  - `watch`
  - `ResizeObserver`
  - `relationship`
  - `ForeignKey`
  - 数据库迁移相关写法
- 不要为了注释而注释。能从代码一眼看懂的地方，不需要重复翻译代码。

## 8. 运行和验证

后端依赖：

```bash
pip install -r requirements.txt
```

前端构建：

```bash
cd frontend
npm install
npm run build
```

启动项目：

```bash
python app.py
```

访问地址：

```text
http://127.0.0.1:5001
```

前后端分开开发时：

```bash
python app.py
```

```bash
cd frontend
npm run dev
```

验证原则：

- 改前端组件或样式后，至少跑 `npm run build`。
- 改后端业务后，至少启动 `python app.py` 确认没有导入错误。
- 改数据库模型后，检查迁移文件，不要只改模型不处理迁移。
- 做视觉布局改动时，用浏览器看实际页面，不要只看代码想象。

## 9. Git 习惯

- 提交前先看 `git status --short`，确认没有误提交数据库、构建产物或系统文件。
- 不提交这些运行文件：
  - `data/project.db`
  - `*.db`
  - `*.sqlite3`
  - `*.db-journal`
  - `frontend/node_modules/`
  - `frontend/dist/`
  - `.DS_Store`
- 提交信息尽量说明阶段和目的，例如：
  - `阶段优化：升级调度驾驶舱布局`
  - `阶段优化：完善订单历史和调度解释`
  - `修复：调整地图相机惯性控制`

## 10. 推荐阅读顺序

1. [README.md](/Users/sunkezan/Desktop/GraduationProject/README.md)
2. [shared/campus_rules.json](/Users/sunkezan/Desktop/GraduationProject/shared/campus_rules.json)
3. [backend/campus/pathfinding.py](/Users/sunkezan/Desktop/GraduationProject/backend/campus/pathfinding.py)
4. [backend/database/](/Users/sunkezan/Desktop/GraduationProject/backend/database)
5. [backend/business/order.py](/Users/sunkezan/Desktop/GraduationProject/backend/business/order.py)
6. [backend/business/dispatch.py](/Users/sunkezan/Desktop/GraduationProject/backend/business/dispatch.py)
7. [frontend/src/dashboard/composables/useDashboardData.js](/Users/sunkezan/Desktop/GraduationProject/frontend/src/dashboard/composables/useDashboardData.js)
8. [frontend/src/dashboard/composables/useDashboardModuleLayout.js](/Users/sunkezan/Desktop/GraduationProject/frontend/src/dashboard/composables/useDashboardModuleLayout.js)
9. [frontend/src/campus/useThreeCampusPrototype.js](/Users/sunkezan/Desktop/GraduationProject/frontend/src/campus/useThreeCampusPrototype.js)
10. [frontend/src/dashboard/DashboardView.vue](/Users/sunkezan/Desktop/GraduationProject/frontend/src/dashboard/DashboardView.vue)

## 11. 最重要的一句话

每次改动都要让这个项目更容易讲清楚：这是一个有园区规则、有订单、有调度、有路径、有车辆运动、有历史回放的智慧园区快递配送系统。
