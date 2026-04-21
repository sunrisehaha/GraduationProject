"""运行时模块：保存地图常量和线程锁。"""

from threading import RLock


MAP_WIDTH = 20
MAP_HEIGHT = 12
OBSTACLES = [
    {"x": 5, "y": 5},
    {"x": 5, "y": 6},
    {"x": 5, "y": 7},
    {"x": 12, "y": 3},
    {"x": 12, "y": 4},
]

# 调度线程仍然会并发修改订单和小车状态，这里继续保留全局锁。
state_lock = RLock()

