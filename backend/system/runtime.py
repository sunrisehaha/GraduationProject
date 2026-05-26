"""运行时模块：从统一园区规则派生地图尺寸、通行区、障碍物和演示状态。

地图规则只从 shared/campus_rules.json 读取，避免后端、前端和 Blender 各写一套世界。
"""

from threading import RLock

from backend.campus.rules import CAMPUS_RULES, point_key, rect_to_points


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


def is_public_road(road):
    """公共道路默认开放；建筑专属入口路只在目标订单里临时放行。"""
    return road.get("accessScope", "public") == "public"


PUBLIC_ROADS = [road for road in CAMPUS_RULES["roads"] if is_public_road(road)]
TARGET_ACCESS_ROADS = [
    road for road in CAMPUS_RULES["roads"] if road.get("accessScope") == "target_access"
]
VEHICLE_AREA_ITEMS = [
    *PUBLIC_ROADS,
    *[zone for zone in CAMPUS_RULES["zones"] if is_vehicle_zone(zone)],
]
ZONE_OBSTACLES = [
    point
    for zone in CAMPUS_RULES["zones"]
    if is_blocked_zone(zone)
    for point in rect_to_points(zone["rect"])
]
POINT_OBSTACLES = [item["point"] for item in CAMPUS_RULES.get("pointObstacles", [])]
# 可行驶区域由 roads 明确给出；建筑 zone 只阻挡非道路区域，不能把道路切断。
OBSTACLES = POINT_OBSTACLES
OBSTACLE_POINTS = {(item["x"], item["y"]) for item in OBSTACLES}
VEHICLE_ACCESSIBLE_POINTS = build_point_set(VEHICLE_AREA_ITEMS) - OBSTACLE_POINTS
SERVICE_POINT_BY_COORD = {
    (point["point"]["x"], point["point"]["y"]): point
    for point in CAMPUS_RULES["servicePoints"]
}
SERVICE_POINT_POINTS = set(SERVICE_POINT_BY_COORD)


def target_accessible_points_for(*points):
    """按订单起终点临时放行对应建筑的专属入口路。"""
    target_zone_ids = {
        service_point.get("targetZoneId")
        for point in points
        for service_point in [SERVICE_POINT_BY_COORD.get((point["x"], point["y"]))]
        if service_point and service_point.get("targetZoneId")
    }
    target_roads = [
        road for road in TARGET_ACCESS_ROADS if road.get("targetZoneId") in target_zone_ids
    ]
    return (build_point_set(target_roads) - OBSTACLE_POINTS) | {
        point_key(point) for point in points
    }


def accessible_points_for_order(*points):
    """订单路径可走公共路，并临时进入起点/终点建筑自己的入口路。"""
    return VEHICLE_ACCESSIBLE_POINTS | target_accessible_points_for(*points)


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
    return in_map_bounds(point) and (
        is_vehicle_accessible_point(point) or point_key(point) in SERVICE_POINT_POINTS
    )

# 调度线程仍然会并发修改订单和小车状态，这里继续保留全局锁。
state_lock = RLock()


# 演示状态只保存在当前后端进程内，重启 Flask 后会恢复默认自动仿真。
demo_mode_enabled = False
simulation_paused = False
current_demo_order_ids = []
last_dispatch_explanation = None
demo_speed_multiplier = 1.0
dynamic_obstacles = []
dynamic_obstacle_block_event_keys = set()
dynamic_obstacle_sensor_event_keys = set()


def serialize_obstacle_cell(point):
    """障碍占格只保留整数坐标，A* 按这些格点判断是否可通行。"""
    return {
        "x": int(point["x"]),
        "y": int(point["y"]),
    }


def serialize_dynamic_obstacle(obstacle):
    """统一临时障碍物返回格式：视觉显示用 center，路径规划用 cells。"""
    cells = [serialize_obstacle_cell(point) for point in obstacle.get("cells", [obstacle])]
    center = obstacle.get("center") or cells[0]

    return {
        "id": obstacle.get("id") or "demo_obstacle_1",
        "type": obstacle.get("type") or "road_block",
        "label_text": obstacle.get("label_text") or "临时施工",
        "road_id": obstacle.get("road_id"),
        "road_name": obstacle.get("road_name"),
        "road_width": obstacle.get("road_width"),
        "block_mode": obstacle.get("block_mode") or "partial_block",
        "center": {
            "x": float(center["x"]),
            "y": float(center["y"]),
        },
        "cells": cells,
        # 兼容旧前端读取 x/y；新逻辑优先读取 center。
        "x": float(center["x"]),
        "y": float(center["y"]),
    }


def get_dynamic_obstacles():
    """读取当前临时障碍物；演示版只保留一个障碍对象。"""
    return [serialize_dynamic_obstacle(obstacle) for obstacle in dynamic_obstacles]


def set_dynamic_obstacle(obstacle):
    """设置一个临时障碍物：用于模拟道路突发占用。"""
    global dynamic_obstacles, dynamic_obstacle_block_event_keys, dynamic_obstacle_sensor_event_keys
    dynamic_obstacles = [serialize_dynamic_obstacle(obstacle)]
    dynamic_obstacle_block_event_keys = set()
    dynamic_obstacle_sensor_event_keys = set()


def clear_dynamic_obstacles():
    """清空临时障碍物：演示重置或手动清除时调用。"""
    global dynamic_obstacles, dynamic_obstacle_block_event_keys, dynamic_obstacle_sensor_event_keys
    dynamic_obstacles = []
    dynamic_obstacle_block_event_keys = set()
    dynamic_obstacle_sensor_event_keys = set()


def get_dynamic_obstacle_cells():
    """把障碍对象展开成 A* 使用的占用格点。"""
    return [
        cell
        for obstacle in get_dynamic_obstacles()
        for cell in obstacle["cells"]
    ]


def get_current_obstacles():
    """合并固定障碍和临时障碍，让路径规划使用最新路况。"""
    return [*OBSTACLES, *get_dynamic_obstacle_cells()]


def get_dynamic_obstacle_for_point(point):
    """返回占用指定格点的临时障碍对象。"""
    target_key = point_key(point)

    for obstacle in get_dynamic_obstacles():
        if target_key in {point_key(cell) for cell in obstacle["cells"]}:
            return obstacle

    return None


def is_dynamic_obstacle(point):
    """判断点位是否被临时障碍占用。"""
    return get_dynamic_obstacle_for_point(point) is not None


def should_record_dynamic_obstacle_block(order_id, cart_id, obstacle_id):
    """同一个障碍阻断同一辆车时，只记录一次等待清除事件。"""
    key = f"{order_id}:{cart_id}:{obstacle_id}"

    if key in dynamic_obstacle_block_event_keys:
        return False

    dynamic_obstacle_block_event_keys.add(key)
    return True


def should_record_dynamic_obstacle_sensor(order_id, cart_id, obstacle_id):
    """同一个障碍被同一辆车传感器检测到时，只记录一次事件。"""
    key = f"{order_id}:{cart_id}:{obstacle_id}"

    if key in dynamic_obstacle_sensor_event_keys:
        return False

    dynamic_obstacle_sensor_event_keys.add(key)
    return True


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


def set_demo_speed(multiplier):
    """设置演示倍速：只影响后台调度循环的节奏，不改订单和小车数据结构。"""
    global demo_speed_multiplier
    allowed_speeds = {0.5, 1.0, 2.0, 4.0}

    try:
        next_speed = float(multiplier)
    except (TypeError, ValueError):
        next_speed = 1.0

    if next_speed not in allowed_speeds:
        next_speed = 1.0

    demo_speed_multiplier = next_speed


def get_demo_speed():
    """读取演示倍速，供接口和后台循环使用。"""
    return demo_speed_multiplier


def get_demo_state(active_orders=0):
    """返回演示状态快照：避免路由层直接拼全局变量。"""
    obstacles = get_dynamic_obstacles()
    return {
        "demo_mode_enabled": demo_mode_enabled,
        "simulation_paused": is_demo_simulation_paused(),
        "current_demo_order_ids": current_demo_order_ids,
        "current_demo_order_count": len(current_demo_order_ids),
        "active_orders": active_orders,
        "speed_multiplier": demo_speed_multiplier,
        "dynamic_obstacles": obstacles,
        "dynamic_obstacle_count": len(obstacles),
    }


def set_last_dispatch_explanation(explanation):
    """记录最近一次调度解释：前端用它说明为什么选中某辆小车。"""
    global last_dispatch_explanation
    last_dispatch_explanation = explanation


def clear_last_dispatch_explanation():
    """清空调度解释：演示重置后避免继续显示旧决策。"""
    set_last_dispatch_explanation(None)


def get_last_dispatch_explanation():
    """读取最近一次调度解释。"""
    return last_dispatch_explanation
