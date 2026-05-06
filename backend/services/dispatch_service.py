"""调度服务：封装订单分配、小车推进和仿真订单生成逻辑。"""

import json

from backend.astar import find_path
from backend.extensions import db
from backend.runtime import MAP_HEIGHT, MAP_WIDTH, OBSTACLES, set_last_dispatch_explanation
from backend.services.cart_service import get_all_carts, get_busy_carts, reset_cart, touch_cart
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


def build_path_segments(cart, order):
    """分别规划小车到取件点、取件点到送达点的路径。"""
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
    return path_to_start, path_to_end


def build_full_path(cart, order):
    """规划完整路径：先从小车当前位置到起点，再从起点到终点。"""
    path_to_start, path_to_end = build_path_segments(cart, order)

    if not path_to_start or not path_to_end:
        return []

    return path_to_start + path_to_end[1:]


def build_dispatch_explanation(order, candidates, selected_cart, selected_path):
    """组装调度解释：把筛选、路径长度和最终结果都交给前端展示。"""
    start_point, end_point = get_order_start_end(order)
    candidate_rows = []

    for item in candidates:
        cart = item["cart"]
        cart_status = item.get("status", cart.status)
        distance_to_pickup = item.get("distance_to_pickup")
        is_selected = bool(selected_cart and cart.id == selected_cart.id)

        if is_selected:
            result = "选中"
        elif cart_status != "idle":
            result = "未选：正在执行任务"
        elif distance_to_pickup is None:
            result = "未选：到取件点无可行路径"
        else:
            result = "未选：到取件点路径更远"

        candidate_rows.append(
            {
                "cart_id": cart.id,
                "cart_name": cart.name,
                "status": cart_status,
                "position": item.get("position", {"x": cart.current_x, "y": cart.current_y}),
                "distance_to_pickup": distance_to_pickup,
                "full_path_length": item.get("full_path_length"),
                "selected": is_selected,
                "result": result,
            }
        )

    return {
        "order_id": order.id,
        "order_no": order.order_no,
        "start_point": start_point,
        "end_point": end_point,
        "selected_cart_id": selected_cart.id if selected_cart else None,
        "selected_cart_name": selected_cart.name if selected_cart else None,
        "selected_path_length": len(selected_path) if selected_path else None,
        "strategy": "最近空闲车优先",
        "summary": (
            f"系统选择 {selected_cart.name}：在所有空闲且路径可达的小车中，它到取件点的路径最短。"
            if selected_cart
            else "当前没有可调度小车：系统没有找到空闲且路径可达的小车。"
        ),
        "candidates": candidate_rows,
    }


def assign_order_to_cart(order, carts):
    """为单个订单分配最近空闲小车。"""
    best_cart = None
    best_path = []
    best_distance = None
    candidates = []

    # 这里按“到取件点路径最短”挑车，符合最近空闲车优先策略。
    for cart in carts:
        if cart.status != "idle":
            candidates.append(
                {
                    "cart": cart,
                    "status": cart.status,
                    "position": {"x": cart.current_x, "y": cart.current_y},
                }
            )
            continue

        path_to_start, path_to_end = build_path_segments(cart, order)
        if not path_to_start or not path_to_end:
            candidates.append(
                {
                    "cart": cart,
                    "status": cart.status,
                    "position": {"x": cart.current_x, "y": cart.current_y},
                }
            )
            continue

        full_path = path_to_start + path_to_end[1:]
        distance = len(path_to_start)
        candidates.append(
            {
                "cart": cart,
                "status": cart.status,
                "position": {"x": cart.current_x, "y": cart.current_y},
                "distance_to_pickup": distance,
                "full_path_length": len(full_path),
            }
        )
        if best_distance is None or distance < best_distance:
            best_cart = cart
            best_path = full_path
            best_distance = distance

    if not best_cart:
        set_last_dispatch_explanation(build_dispatch_explanation(order, candidates, None, []))
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
    set_last_dispatch_explanation(build_dispatch_explanation(order, candidates, best_cart, best_path))
    db.session.commit()
    return best_cart


def dispatch_pending_orders():
    """扫描待分配订单并尝试调度。"""
    for order in get_pending_orders():
        assign_order_to_cart(order, get_all_carts())


def complete_cart_order(cart, order):
    """完成当前任务并复位小车。"""
    complete_order(order)
    reset_cart(cart)
    db.session.commit()


def advance_carts():
    """推进所有忙碌小车向前移动一步。"""
    for cart in get_busy_carts():
        # 数据库存的是 JSON 字符串，这里先还原成路径数组。
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
