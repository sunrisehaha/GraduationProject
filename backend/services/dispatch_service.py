"""调度服务：封装订单分配和小车移动逻辑。"""

import json

from backend.astar import find_path
from backend.extensions import db
from backend.runtime import MAP_HEIGHT, MAP_WIDTH, OBSTACLES
from backend.services.cart_service import get_busy_carts, get_idle_carts, reset_cart, touch_cart
from backend.services.order_service import (
    complete_order,
    count_active_orders,
    create_simulated_order,
    get_order_by_id,
    get_order_start_end,
    get_pending_orders,
    mark_order_delivering,
    set_order_assignment,
)


def build_full_path(cart, order):
    """规划完整路径：先去取件点，再去终点。"""
    start_point, end_point = get_order_start_end(order)
    cart_position = {"x": cart.current_x, "y": cart.current_y}

    path_to_start = find_path(
        start=cart_position,
        end=start_point,
        obstacles=OBSTACLES,
        width=MAP_WIDTH,
        height=MAP_HEIGHT,
    )
    path_to_end = find_path(
        start=start_point,
        end=end_point,
        obstacles=OBSTACLES,
        width=MAP_WIDTH,
        height=MAP_HEIGHT,
    )

    if not path_to_start or not path_to_end:
        return []

    return path_to_start + path_to_end[1:]


def assign_order_to_cart(order, carts):
    """为单个订单分配最近空闲小车。"""
    best_cart = None
    best_path = []
    best_distance = None

    for cart in carts:
        if cart.status != "idle":
            continue

        full_path = build_full_path(cart, order)
        if not full_path:
            continue

        distance = len(full_path)
        if best_distance is None or distance < best_distance:
            best_cart = cart
            best_path = full_path
            best_distance = distance

    if not best_cart:
        return None

    start_point, _ = get_order_start_end(order)
    best_cart.current_order_id = order.id
    best_cart.current_path_json = json.dumps(best_path, ensure_ascii=False)
    best_cart.path_index = 1 if len(best_path) > 1 else 0
    best_cart.status = (
        "delivering"
        if best_cart.current_x == start_point["x"] and best_cart.current_y == start_point["y"]
        else "to_pickup"
    )
    touch_cart(best_cart)

    order_status = "delivering" if best_cart.status == "delivering" else "assigned"
    set_order_assignment(order, best_cart, best_path, order_status)
    db.session.commit()
    return best_cart


def dispatch_pending_orders():
    """扫描待分配订单并尝试调度。"""
    for order in get_pending_orders():
        idle_carts = get_idle_carts()
        if not idle_carts:
            return
        assign_order_to_cart(order, idle_carts)


def complete_cart_order(cart, order):
    """完成当前任务并复位小车。"""
    complete_order(order)
    reset_cart(cart)
    db.session.commit()


def advance_carts():
    """推进所有忙碌小车向前移动一步。"""
    for cart in get_busy_carts():
        path = json.loads(cart.current_path_json or "[]")
        order = get_order_by_id(cart.current_order_id)

        if not path or not order:
            reset_cart(cart)
            db.session.commit()
            continue

        if cart.path_index >= len(path):
            complete_cart_order(cart, order)
            continue

        next_point = path[cart.path_index]
        cart.current_x = next_point["x"]
        cart.current_y = next_point["y"]
        cart.path_index += 1
        touch_cart(cart)

        start_point, _ = get_order_start_end(order)
        if (
            order.status == "assigned"
            and cart.current_x == start_point["x"]
            and cart.current_y == start_point["y"]
        ):
            cart.status = "delivering"
            mark_order_delivering(order)

        if cart.path_index >= len(path):
            complete_cart_order(cart, order)
            continue

        db.session.commit()


def create_simulation_order_if_needed(max_active_orders):
    """按活动订单数量决定是否生成仿真订单。"""
    if count_active_orders() < max_active_orders:
        create_simulated_order()

