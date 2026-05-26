"""虚拟传感器业务：模拟小车沿当前路径向前感知临时障碍。"""

import json

from backend.system.runtime import get_dynamic_obstacle_for_point

FRONT_SENSOR_RANGE_TILES = 6


def load_cart_path(cart):
    """还原小车路径；传感器只读路径，不改变小车状态。"""
    try:
        return json.loads(cart.current_path_json or "[]")
    except json.JSONDecodeError:
        return []


def build_idle_sensor_status(message="传感器待命"):
    """空闲或无路径时返回稳定的前端展示结构。"""
    return {
        "type": "front_obstacle",
        "name": "前向障碍传感器",
        "range_tiles": FRONT_SENSOR_RANGE_TILES,
        "detected": False,
        "distance_tiles": None,
        "obstacle": None,
        "message": message,
    }


def scan_front_obstacle_sensor(cart, path=None):
    """扫描小车当前路径前方若干格，命中临时障碍时返回距离和障碍对象。"""
    current_path = path if path is not None else load_cart_path(cart)

    if cart.status == "idle" or not current_path:
        return build_idle_sensor_status()

    start_index = max(0, int(cart.path_index or 0))
    scan_points = current_path[start_index:start_index + FRONT_SENSOR_RANGE_TILES]

    if not scan_points:
        return build_idle_sensor_status("当前路径即将结束")

    for offset, point in enumerate(scan_points, start=1):
        obstacle = get_dynamic_obstacle_for_point(point)
        if not obstacle:
            continue

        return {
            "type": "front_obstacle",
            "name": "前向障碍传感器",
            "range_tiles": FRONT_SENSOR_RANGE_TILES,
            "detected": True,
            "distance_tiles": offset,
            "obstacle": obstacle,
            "message": f"前方 {offset} 格检测到临时施工障碍",
        }

    return build_idle_sensor_status("传感器正常")
