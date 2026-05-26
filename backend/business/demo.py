"""演示控制服务：负责答辩时的场景重置和随机演示订单创建。"""

import json
import random

from backend.business.cart import get_busy_carts
from backend.business.order import (
    ACTIVE_ORDER_STATUSES,
    count_active_orders,
    create_order,
    get_order_by_id,
    get_order_start_end,
    serialize_order,
)
from backend.campus.rules import (
    CAMPUS_RULES,
    DEFAULT_CARTS,
    all_order_pickup_points,
    point_key,
    service_points_by_ids,
)
from backend.database import Cart, Order, OrderEvent, OrderPoint
from backend.system.extensions import db
from backend.system.runtime import (
    clear_dynamic_obstacles,
    clear_last_dispatch_explanation,
    get_dynamic_obstacles,
    get_demo_state,
    is_vehicle_accessible_point,
    set_dynamic_obstacle,
    set_current_demo_order_ids,
    set_demo_mode,
    set_demo_speed,
    set_simulation_paused,
)

MIN_OBSTACLE_REMAINING_POINTS = 4
OBSTACLE_CANDIDATE_FRONT_SPAN = 12


def build_demo_order_templates(demo_key):
    """随机生成演示订单：取件点和送货点都从业务点位中随机选取。

    每次调用都会产生不同的组合，避免答辩演示时每次都是同一组固定订单。
    demo_key 决定生成数量：'one' 生成 1 单，其余情况生成 5 单。
    """
    pickup_points = all_order_pickup_points()
    delivery_points = service_points_by_ids(CAMPUS_RULES["simulation"]["deliveryPointIds"])
    count = 1 if demo_key == "one" else 5

    templates = []
    for _ in range(count):
        start_point = random.choice(pickup_points)
        end_point = random.choice(delivery_points)
        while start_point["x"] == end_point["x"] and start_point["y"] == end_point["y"]:
            end_point = random.choice(delivery_points)

        templates.append({
            "start_point": start_point,
            "end_point": end_point,
            "remark": f"随机演示：{start_point['label_text']} → {end_point['label_text']}",
        })
    return templates


def get_current_demo_state():
    """读取演示状态：补上活动订单数，供前端面板展示。"""
    return get_demo_state(active_orders=count_active_orders())


def is_point_reserved_for_task(point, cart, order):
    """临时障碍不能压住小车当前位置和订单起终点。"""
    start_point, end_point = get_order_start_end(order)
    reserved_points = [
        {"x": cart.current_x, "y": cart.current_y},
        start_point,
        end_point,
    ]
    return point_key(point) in {point_key(item) for item in reserved_points if item}


def parse_cart_path(cart):
    """还原小车当前路径；异常数据直接视为没有路径。"""
    try:
        return json.loads(cart.current_path_json or "[]")
    except json.JSONDecodeError:
        return []


def point_in_rect(point, rect):
    """判断一个网格点是否落在道路矩形内。"""
    return (
        point["x"] >= rect["x"]
        and point["x"] < rect["x"] + rect["width"]
        and point["y"] >= rect["y"]
        and point["y"] < rect["y"] + rect["height"]
    )


def get_road_width(road):
    """道路通行宽度取矩形短边，和前端地图规则保持一致。"""
    rect = road["rect"]
    return min(rect["width"], rect["height"])


def get_single_public_road_at(point):
    """只在非路口的公共道路投放障碍，避免交叉区域语义不清。"""
    public_roads = [
        road
        for road in CAMPUS_RULES["roads"]
        if road.get("accessScope", "public") == "public" and point_in_rect(point, road["rect"])
    ]

    if len(public_roads) != 1:
        return None

    road = public_roads[0]
    return road if get_road_width(road) in [2, 3] else None


def build_obstacle_for_road_point(point, road, cart, order):
    """把一个路径点转换成临时施工障碍：2 格路封闭，3 格路中线占道。"""
    rect = road["rect"]
    road_width = get_road_width(road)
    direction = road.get("direction")
    cells = []
    center = None

    if direction == "horizontal":
        if road_width == 2:
            cells = [{"x": point["x"], "y": y} for y in range(rect["y"], rect["y"] + rect["height"])]
            center = {"x": point["x"], "y": rect["y"] + 0.5}
        else:
            center_y = rect["y"] + 1
            if point["y"] != center_y:
                return None
            cells = [{"x": point["x"], "y": center_y}]
            center = {"x": point["x"], "y": center_y}
    elif direction == "vertical":
        if road_width == 2:
            cells = [{"x": x, "y": point["y"]} for x in range(rect["x"], rect["x"] + rect["width"])]
            center = {"x": rect["x"] + 0.5, "y": point["y"]}
        else:
            center_x = rect["x"] + 1
            if point["x"] != center_x:
                return None
            cells = [{"x": center_x, "y": point["y"]}]
            center = {"x": center_x, "y": point["y"]}
    else:
        return None

    if any(is_point_reserved_for_task(cell, cart, order) for cell in cells):
        return None

    if any(not is_vehicle_accessible_point(cell) for cell in cells):
        return None

    return {
        "id": "demo_obstacle_1",
        "type": "road_block",
        "label_text": "临时施工",
        "road_id": road.get("id"),
        "road_name": road.get("name"),
        "road_width": road_width,
        "block_mode": "full_closure" if road_width == 2 else "partial_block",
        "center": center,
        "cells": cells,
    }


def pick_obstacle_point_for_cart(cart, order):
    """从小车前方路径里挑一个适合演示的临时施工障碍。"""
    path = parse_cart_path(cart)
    remaining_path = path[cart.path_index:]

    if not path:
        raise ValueError("当前小车路径尚未生成")

    if len(remaining_path) < MIN_OBSTACLE_REMAINING_POINTS:
        raise ValueError("当前路径剩余距离过短，无法投放障碍")

    preferred_path = (
        remaining_path[2:OBSTACLE_CANDIDATE_FRONT_SPAN]
        + remaining_path[:2]
        + remaining_path[OBSTACLE_CANDIDATE_FRONT_SPAN:]
    )

    for point in preferred_path:
        if is_point_reserved_for_task(point, cart, order):
            continue

        road = get_single_public_road_at(point)
        if not road:
            continue

        obstacle = build_obstacle_for_road_point(point, road, cart, order)
        if obstacle:
            return obstacle

    return None


def coerce_optional_id(value):
    """把前端传来的 id 整理成整数；空值保持为空。"""
    if value in [None, ""]:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_cart_for_order(order):
    """按订单找到正在执行它的小车。"""
    if not order.assigned_cart_id:
        return None

    return db.session.get(Cart, order.assigned_cart_id)


def validate_order_for_obstacle(order):
    """投放前先把交互状态说清楚，避免地图上出现无归属障碍。"""
    if not order:
        raise ValueError("当前没有运行中的配送任务，无法投放障碍")

    if order.status == "pending":
        raise ValueError("订单尚未分配小车，请等待调度完成后再投放障碍")

    if order.status not in ACTIVE_ORDER_STATUSES:
        raise ValueError("当前任务已完成，请选择运行中的订单")


def place_obstacle_for_order(order):
    """按当前高亮订单投放障碍。"""
    validate_order_for_obstacle(order)
    cart = get_cart_for_order(order)

    if not cart or cart.current_order_id != order.id:
        raise ValueError("当前小车路径尚未生成")

    obstacle = pick_obstacle_point_for_cart(cart, order)
    if not obstacle:
        raise ValueError("当前没有适合投放障碍的运行路径")

    set_dynamic_obstacle(obstacle)
    return get_current_demo_state()


def place_route_obstacle(order_id=None, cart_id=None):
    """一键投放障碍：优先放到当前高亮订单对应小车的前方路径上。"""
    if get_dynamic_obstacles():
        raise ValueError("请先清除当前临时障碍")

    normalized_order_id = coerce_optional_id(order_id)
    normalized_cart_id = coerce_optional_id(cart_id)

    if normalized_order_id is not None:
        return place_obstacle_for_order(get_order_by_id(normalized_order_id))

    if count_active_orders() == 0:
        raise ValueError("当前没有运行中的配送任务，无法投放障碍")

    busy_carts = get_busy_carts()
    if normalized_cart_id is not None:
        busy_carts.sort(key=lambda cart: 0 if cart.id == normalized_cart_id else 1)

    if not busy_carts:
        raise ValueError("订单尚未分配小车，请等待调度完成后再投放障碍")

    for cart in busy_carts:
        order = get_order_by_id(cart.current_order_id)
        if not order:
            continue

        try:
            obstacle = pick_obstacle_point_for_cart(cart, order)
        except ValueError:
            continue

        if not obstacle:
            continue

        set_dynamic_obstacle(obstacle)
        return get_current_demo_state()

    raise ValueError("当前没有适合投放障碍的运行路径")


def clear_route_obstacle():
    """清除当前临时障碍。"""
    clear_dynamic_obstacles()
    return get_current_demo_state()


def set_demo_enabled(enabled):
    """切换演示模式：开启时暂停自动仿真，关闭时恢复自动仿真。"""
    set_demo_mode(enabled)

    if not enabled:
        set_simulation_paused(False)

    return get_current_demo_state()


def set_demo_speed_multiplier(multiplier):
    """切换演示倍速：前端只传倍率，状态快照仍走统一出口。"""
    set_demo_speed(multiplier)
    return get_current_demo_state()


def reset_demo_scene():
    """重置演示场景：清空订单，保留并重置小车到默认待命位置。"""
    clear_dynamic_obstacles()
    OrderEvent.query.delete()
    OrderPoint.query.delete()
    Order.query.delete()

    default_cart_ids = {item["id"] for item in DEFAULT_CARTS}
    existing_carts = {cart.id: cart for cart in Cart.query.all()}
    for cart in existing_carts.values():
        if cart.id not in default_cart_ids:
            db.session.delete(cart)

    for item in DEFAULT_CARTS:
        cart = existing_carts.get(item["id"])

        if not cart:
            cart = Cart(id=item["id"], name=item["name"])
            db.session.add(cart)

        cart.name = item["name"]
        cart.status = "idle"
        cart.current_x = item["x"]
        cart.current_y = item["y"]
        cart.current_order_id = None
        cart.current_path_json = "[]"
        cart.path_index = 0
        cart.battery_level = 100

    db.session.commit()
    set_demo_mode(True)
    set_current_demo_order_ids([])
    clear_last_dispatch_explanation()
    return get_current_demo_state()


def create_demo_orders(order_templates):
    """批量创建演示订单：创建后交给现有调度线程自动分配。"""
    set_demo_mode(True)
    created_orders = [
        create_order(
            start_point=template["start_point"],
            end_point=template["end_point"],
            source="demo",
            remark=template["remark"],
        )
        for template in order_templates
    ]
    set_current_demo_order_ids([order.id for order in created_orders])
    return {
        **get_current_demo_state(),
        "orders": [serialize_order(order) for order in created_orders],
    }


def create_one_demo_order():
    """创建单订单演示：适合讲完整业务链。"""
    return create_demo_orders(build_demo_order_templates("one"))


def create_five_demo_orders():
    """创建五订单演示：适合展示多车并行调度。"""
    return create_demo_orders(build_demo_order_templates("five"))
