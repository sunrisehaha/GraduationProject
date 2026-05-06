"""运行时模块：从统一园区规则派生地图尺寸、通行区、障碍物和演示状态。

地图规则只从 shared/campus_rules.json 读取，避免后端、前端和 Blender 各写一套世界。
"""

from threading import RLock

from backend.campus_rules import CAMPUS_RULES, point_key, rect_to_points


MAP_WIDTH = CAMPUS_RULES["grid"]["cols"]
MAP_HEIGHT = CAMPUS_RULES["grid"]["rows"]


def build_point_set(items):
    """把多个矩形区域展开成坐标集合，给路径规划做快速判断。"""
    return {
        point_key(point)
        for item in items
        for point in rect_to_points(item["rect"])
    }


def is_vehicle_zone(zone):
    """判断开放区是否允许小车进入：停车区和物流装卸区都算车行区域。"""
    return zone.get("cartPassable") and zone.get("reserveUse") in ["parking", "logistics"]


def is_blocked_zone(zone):
    """判断区域是否阻挡小车：建筑、绿地、广场等都不能通行。"""
    return not zone.get("cartPassable", False)


VEHICLE_AREA_ITEMS = [
    *CAMPUS_RULES["roads"],
    *[zone for zone in CAMPUS_RULES["zones"] if is_vehicle_zone(zone)],
]
ZONE_OBSTACLES = [
    point
    for zone in CAMPUS_RULES["zones"]
    if is_blocked_zone(zone)
    for point in rect_to_points(zone["rect"])
]
POINT_OBSTACLES = [item["point"] for item in CAMPUS_RULES.get("pointObstacles", [])]
OBSTACLES = [*ZONE_OBSTACLES, *POINT_OBSTACLES]
OBSTACLE_POINTS = {(item["x"], item["y"]) for item in OBSTACLES}
VEHICLE_ACCESSIBLE_POINTS = build_point_set(VEHICLE_AREA_ITEMS) - OBSTACLE_POINTS


def in_map_bounds(point):
    """判断点位是否在当前地图范围内。"""
    return 0 <= point["x"] < MAP_WIDTH and 0 <= point["y"] < MAP_HEIGHT


def is_obstacle(point):
    """判断点位是否落在障碍区。"""
    return (point["x"], point["y"]) in OBSTACLE_POINTS


def is_vehicle_accessible_point(point):
    """判断点位是否在小车真实可行驶区域内。"""
    return (point["x"], point["y"]) in VEHICLE_ACCESSIBLE_POINTS


def is_free_point(point):
    """判断点位是否可以放订单或小车。"""
    return in_map_bounds(point) and is_vehicle_accessible_point(point)

# 调度线程仍然会并发修改订单和小车状态，这里继续保留全局锁。
state_lock = RLock()


# 演示状态只保存在当前后端进程内，重启 Flask 后会恢复默认自动仿真。
demo_mode_enabled = False
simulation_paused = False
current_demo_order_ids = []


def is_demo_simulation_paused():
    """判断仿真订单是否暂停：演示模式开启时一定暂停自动造单。"""
    return demo_mode_enabled or simulation_paused


def set_demo_mode(enabled):
    """切换演示模式：开启后同步暂停自动仿真订单。"""
    global demo_mode_enabled, simulation_paused
    demo_mode_enabled = bool(enabled)
    simulation_paused = bool(enabled)


def set_simulation_paused(paused):
    """单独切换仿真暂停状态：给恢复自动仿真按钮使用。"""
    global simulation_paused
    simulation_paused = bool(paused)


def set_current_demo_order_ids(order_ids):
    """记录当前演示订单：前端只需要知道这批订单数量和编号。"""
    global current_demo_order_ids
    current_demo_order_ids = list(order_ids)


def get_demo_state(active_orders=0):
    """返回演示状态快照：避免路由层直接拼全局变量。"""
    return {
        "demo_mode_enabled": demo_mode_enabled,
        "simulation_paused": is_demo_simulation_paused(),
        "current_demo_order_ids": current_demo_order_ids,
        "current_demo_order_count": len(current_demo_order_ids),
        "active_orders": active_orders,
    }
