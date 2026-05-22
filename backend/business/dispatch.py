"""调度业务：封装订单分配、小车推进和仿真订单生成逻辑。"""

import json
from math import ceil

from backend.business.cart import get_all_carts, get_busy_carts, reset_cart, touch_cart
from backend.business.order import (
    complete_order,
    count_active_orders,
    count_recent_cart_assignments,
    create_simulated_order,
    get_order_by_id,
    get_order_start_end,
    get_pending_orders,
    mark_order_delivering,
    set_order_assignment,
)
from backend.campus.pathfinding import find_path
from backend.system.extensions import db
from backend.system.runtime import (
    MAP_HEIGHT,
    MAP_WIDTH,
    OBSTACLES,
    accessible_points_for_order,
    set_last_dispatch_explanation,
)

BATTERY_MAX_LEVEL = 100
# 园区最大完整任务约 300 格；按 4 格消耗 1% 计算，满电小车能覆盖任意一单并留下余量。
BATTERY_STEPS_PER_PERCENT = 4
BATTERY_USE_PER_DRAIN_TICK = 1
IDLE_RECHARGE_PER_TICK = 1
MIN_BATTERY_RESERVE = 8
BATTERY_HEALTHY_LEVEL = 80
LOW_BATTERY_WEIGHT = 0.4
RECENT_ASSIGNMENT_MINUTES = 30
RECENT_TASK_WEIGHT = 6
UNUSED_CART_BONUS = 8


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
        accessible_points=accessible_points_for_order(cart_position, start_point),
    )
    path_to_end = find_path(
        start=start_point,
        end=end_point,
        obstacles=OBSTACLES,
        width=MAP_WIDTH,
        height=MAP_HEIGHT,
        accessible_points=accessible_points_for_order(start_point, end_point),
    )
    return path_to_start, path_to_end


def build_full_path(cart, order):
    """规划完整路径：先从小车当前位置到起点，再从起点到终点。"""
    path_to_start, path_to_end = build_path_segments(cart, order)

    if not path_to_start or not path_to_end:
        return []

    return path_to_start + path_to_end[1:]


def path_step_count(path):
    """把路径节点数换成移动步数：两个相邻节点之间才算一格路程。"""
    return max(0, len(path) - 1)


def clamp_battery(value):
    """限制电量范围：避免移动扣电或回充时越界。"""
    return max(0, min(BATTERY_MAX_LEVEL, int(value)))


def get_cart_battery(cart):
    """读取小车电量：旧数据如果还没有值，就按满电处理。"""
    return cart.battery_level if cart.battery_level is not None else BATTERY_MAX_LEVEL


def estimate_battery_usage(path):
    """估算完成本次任务需要的电量：若干格路程折算成 1% 电量。"""
    return max(1, ceil(path_step_count(path) / BATTERY_STEPS_PER_PERCENT))


def should_drain_battery_for_step(moved_steps):
    """按路径步数扣电：第 1、5、9...步各扣 1%，总量与预估保持一致。"""
    return moved_steps > 0 and (moved_steps - 1) % BATTERY_STEPS_PER_PERCENT == 0


def build_candidate_score(cart, path_to_start, path_to_end):
    """计算候选小车评分：分数越低，越适合接这个订单。"""
    full_path = path_to_start + path_to_end[1:]
    distance_to_pickup = path_step_count(path_to_start)
    delivery_distance = path_step_count(path_to_end)
    estimated_battery_usage = estimate_battery_usage(full_path)
    battery_level = get_cart_battery(cart)
    battery_required = estimated_battery_usage + MIN_BATTERY_RESERVE
    recent_task_count = count_recent_cart_assignments(cart.id, RECENT_ASSIGNMENT_MINUTES)
    battery_penalty = max(0, BATTERY_HEALTHY_LEVEL - battery_level) * LOW_BATTERY_WEIGHT
    recent_task_penalty = recent_task_count * RECENT_TASK_WEIGHT
    unused_bonus = UNUSED_CART_BONUS if recent_task_count == 0 else 0
    score = max(
        0,
        distance_to_pickup + battery_penalty + recent_task_penalty - unused_bonus,
    )

    return {
        "full_path": full_path,
        "distance_to_pickup": distance_to_pickup,
        "delivery_distance": delivery_distance,
        "full_path_length": len(full_path),
        "estimated_battery_usage": estimated_battery_usage,
        "battery_level": battery_level,
        "battery_required": battery_required,
        "battery_penalty": round(battery_penalty, 1),
        "recent_task_count": recent_task_count,
        "recent_task_penalty": round(recent_task_penalty, 1),
        "unused_bonus": unused_bonus,
        "score": round(score, 1),
        "battery_enough": battery_level >= battery_required,
    }


def build_dispatch_explanation(order, candidates, selected_cart, selected_path):
    """组装调度解释：把筛选、评分和最终结果都交给前端展示。"""
    start_point, end_point = get_order_start_end(order)
    candidate_rows = []
    selected_row = None

    for item in candidates:
        cart = item["cart"]
        cart_status = item.get("status", cart.status)
        distance_to_pickup = item.get("distance_to_pickup")
        is_selected = bool(selected_cart and cart.id == selected_cart.id)

        if is_selected:
            result = "选中：综合成本最低"
        elif cart_status != "idle":
            result = "未选：正在执行任务"
        elif distance_to_pickup is None:
            result = "未选：到取件点无可行路径"
        elif not item.get("battery_enough", True):
            result = "未选：电量不足"
        else:
            result = "未选：综合成本更高"

        row = {
            "cart_id": cart.id,
            "cart_name": cart.name,
            "status": cart_status,
            "position": item.get("position", {"x": cart.current_x, "y": cart.current_y}),
            "distance_to_pickup": distance_to_pickup,
            "delivery_distance": item.get("delivery_distance"),
            "full_path_length": item.get("full_path_length"),
            "battery_level": item.get("battery_level", get_cart_battery(cart)),
            "estimated_battery_usage": item.get("estimated_battery_usage"),
            "recent_task_count": item.get("recent_task_count"),
            "score": item.get("score"),
            "selected": is_selected,
            "result": result,
        }
        candidate_rows.append(row)

        if is_selected:
            selected_row = row

    candidate_rows.sort(
        key=lambda row: (
            not row["selected"],
            row["score"] is None,
            row["score"] if row["score"] is not None else 9999,
            row["cart_id"],
        )
    )

    if selected_cart and selected_row:
        summary = (
            f"系统选择 {selected_cart.name}：综合成本 {selected_row['score']} 最低。"
            f"它到取件点 {selected_row['distance_to_pickup']} 格，"
            f"当前电量 {selected_row['battery_level']}%，"
            f"预计耗电 {selected_row['estimated_battery_usage']}%，"
            f"近 {RECENT_ASSIGNMENT_MINUTES} 分钟接单 {selected_row['recent_task_count']} 次。"
        )
    else:
        summary = "当前没有可调度小车：系统没有找到空闲、路径可达且电量足够的小车。"

    return {
        "order_id": order.id,
        "order_no": order.order_no,
        "start_point": start_point,
        "end_point": end_point,
        "selected_cart_id": selected_cart.id if selected_cart else None,
        "selected_cart_name": selected_cart.name if selected_cart else None,
        "selected_path_length": len(selected_path) if selected_path else None,
        "strategy": "电量与车队均衡综合评分",
        "score_formula": "空驶距离 + 低电量惩罚 + 近期接单惩罚 - 长期未使用奖励",
        "summary": summary,
        "candidates": candidate_rows,
    }


def assign_order_to_cart(order, carts):
    """为单个订单分配综合成本最低的小车。"""
    best_cart = None
    best_path = []
    best_score = None
    best_distance = None
    candidates = []

    # 先过滤掉忙碌、不可达、电量不足的小车，再在可用候选里做综合评分。
    for cart in carts:
        base_candidate = {
            "cart": cart,
            "status": cart.status,
            "position": {"x": cart.current_x, "y": cart.current_y},
            "battery_level": get_cart_battery(cart),
        }

        if cart.status != "idle":
            candidates.append(base_candidate)
            continue

        path_to_start, path_to_end = build_path_segments(cart, order)
        if not path_to_start or not path_to_end:
            candidates.append(base_candidate)
            continue

        scored_candidate = {
            **base_candidate,
            **build_candidate_score(cart, path_to_start, path_to_end),
        }
        candidates.append(scored_candidate)

        if not scored_candidate["battery_enough"]:
            continue

        distance = scored_candidate["distance_to_pickup"]
        score = scored_candidate["score"]
        if (
            best_score is None
            or score < best_score
            or (score == best_score and distance < best_distance)
        ):
            best_cart = cart
            best_path = scored_candidate["full_path"]
            best_score = score
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
    explanation = build_dispatch_explanation(order, candidates, best_cart, best_path)
    set_order_assignment(order, best_cart, best_path, order_status, dispatch_explanation=explanation)
    set_last_dispatch_explanation(explanation)
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


def recharge_idle_carts():
    """给空闲小车缓慢回充：不单独做充电站，先保持演示逻辑简单。"""
    changed = False

    for cart in get_all_carts():
        if cart.status != "idle" or get_cart_battery(cart) >= BATTERY_MAX_LEVEL:
            continue

        cart.battery_level = clamp_battery(get_cart_battery(cart) + IDLE_RECHARGE_PER_TICK)
        touch_cart(cart)
        changed = True

    if changed:
        db.session.commit()


def advance_carts():
    """推进所有忙碌小车向前移动一步。"""
    recharge_idle_carts()

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
        moved_steps = cart.path_index - 1
        if should_drain_battery_for_step(moved_steps):
            cart.battery_level = clamp_battery(get_cart_battery(cart) - BATTERY_USE_PER_DRAIN_TICK)
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
