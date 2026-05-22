"""园区规则读取器：从 shared/campus_rules.json 读取唯一世界规则。"""

import json
from pathlib import Path


RULES_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "campus_rules.json"


def load_campus_rules():
    """读取园区世界规则：后端地图、订单和演示控制都基于这一份数据。"""
    with RULES_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


CAMPUS_RULES = load_campus_rules()


def rect_to_tuple(rect):
    """把 JSON 矩形转成内部更方便展开的元组。"""
    return rect["x"], rect["y"], rect["width"], rect["height"]


def rect_to_points(rect):
    """把矩形区域展开为网格点。"""
    x_start, y_start, width, height = rect_to_tuple(rect)
    return [
        {"x": x, "y": y}
        for x in range(x_start, x_start + width)
        for y in range(y_start, y_start + height)
    ]


def point_key(point):
    """统一点位键：路径规划用集合判断更快。"""
    return point["x"], point["y"]


def get_service_point(point_id):
    """按业务点位 id 找点：演示订单和地点名回填共用。"""
    return next(
        (point for point in CAMPUS_RULES["servicePoints"] if point["id"] == point_id),
        None,
    )


def service_point_payload(point_id):
    """把业务点位转成订单使用的坐标载荷。"""
    service_point = get_service_point(point_id)

    if not service_point:
        raise ValueError(f"未找到业务点位：{point_id}")

    return {
        "x": service_point["point"]["x"],
        "y": service_point["point"]["y"],
        "label_text": service_point["name"].replace("收件点", "").strip(),
    }


def service_points_by_ids(point_ids):
    """按 id 列表返回订单可用点位。"""
    return [service_point_payload(point_id) for point_id in point_ids]


def all_order_pickup_points():
    """寄件点使用全部业务点位：物流点、门岗和每栋建筑门前点都可以发件。"""
    return service_points_by_ids(CAMPUS_RULES["simulation"]["pickupPointIds"])


DEFAULT_CARTS = CAMPUS_RULES["defaultCarts"]
