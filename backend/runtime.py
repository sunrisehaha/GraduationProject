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


# 障碍物坐标：这里按“8 栋住宅楼 + 公共服务建筑群”的新版园区格局细化。
OBSTACLES = [
    *build_block(4, 3, 2, 3),      # 1栋住宅楼
    *build_block(8, 3, 2, 3),      # 2栋住宅楼
    *build_block(4, 7, 2, 3),      # 3栋住宅楼
    *build_block(8, 7, 2, 3),      # 4栋住宅楼
    *build_block(4, 22, 2, 3),     # 5栋住宅楼
    *build_block(8, 22, 2, 3),     # 6栋住宅楼
    *build_block(4, 26, 2, 3),     # 7栋住宅楼
    *build_block(8, 26, 2, 3),     # 8栋住宅楼
    *build_block(17, 4, 4, 4),     # 住户服务大楼
    *build_block(23, 4, 3, 4),     # 党群服务中心
    *build_block(32, 4, 3, 4),     # 物业管理中心
    *build_block(31, 9, 4, 3),     # 快递服务中心
    *build_block(17, 22, 4, 5),    # 运动健身中心
    *build_block(22, 22, 4, 5),    # 综合楼
    *build_block(33, 24, 2, 3),    # 发电间
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
