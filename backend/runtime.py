"""运行时模块：保存地图尺寸、障碍物和线程锁。

这些数据更像“运行环境配置”，不适合继续放在模型文件里，
所以单独拆到这里，方便后端其他模块统一引用。
"""

from threading import RLock


MAP_WIDTH = 40
MAP_HEIGHT = 35


def build_block(x_start, y_start, width, height):
    """生成矩形障碍区：用少量配置表达一片建筑区域。"""
    return [
        {"x": x, "y": y}
        for x in range(x_start, x_start + width)
        for y in range(y_start, y_start + height)
    ]


# 障碍物坐标：路径规划和地图绘制都会用到这份数据。
OBSTACLES = [
    *build_block(6, 5, 4, 7),      # 宿舍区 A
    *build_block(16, 4, 5, 6),     # 综合楼
    *build_block(29, 7, 5, 6),     # 快递站
    *build_block(7, 22, 6, 7),     # 宿舍区 B
    *build_block(22, 21, 6, 7),    # 教学实验区
    *build_block(17, 14, 3, 5),    # 中央绿化隔离带
]


def in_map_bounds(point):
    """判断点位是否在当前地图范围内。"""
    return 0 <= point["x"] < MAP_WIDTH and 0 <= point["y"] < MAP_HEIGHT


def is_obstacle(point):
    """判断点位是否落在障碍区。"""
    return (point["x"], point["y"]) in {(item["x"], item["y"]) for item in OBSTACLES}


def is_free_point(point):
    """判断点位是否可以放订单或小车。"""
    return in_map_bounds(point) and not is_obstacle(point)

# 调度线程仍然会并发修改订单和小车状态，这里继续保留全局锁。
state_lock = RLock()
