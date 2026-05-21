"""演示控制服务：负责答辩时的场景重置和随机演示订单创建。"""

import random

from backend.business.order import count_active_orders, create_order, serialize_order
from backend.campus.rules import CAMPUS_RULES, DEFAULT_CARTS, service_point_payload
from backend.database import Cart, Order, OrderEvent, OrderPoint
from backend.system.extensions import db
from backend.system.runtime import (
    clear_last_dispatch_explanation,
    get_demo_state,
    set_current_demo_order_ids,
    set_demo_mode,
    set_demo_speed,
    set_simulation_paused,
)


def build_demo_order_templates(demo_key):
    """随机生成演示订单：取件点从快递站/装货口中随机选取，送货点从全部业务收件点中随机选取。

    每次调用都会产生不同的组合，避免答辩演示时每次都是同一组固定订单。
    demo_key 决定生成数量：'one' 生成 1 单，其余情况生成 5 单。
    """
    pickup_ids = CAMPUS_RULES["simulation"]["pickupPointIds"]
    delivery_ids = CAMPUS_RULES["simulation"]["deliveryPointIds"]
    count = 1 if demo_key == "one" else 5

    templates = []
    for _ in range(count):
        start_id = random.choice(pickup_ids)
        end_id = random.choice(delivery_ids)
        start_point = service_point_payload(start_id)
        end_point = service_point_payload(end_id)
        templates.append({
            "start_point": start_point,
            "end_point": end_point,
            "remark": f"随机演示：{start_point['label_text']} → {end_point['label_text']}",
        })
    return templates


def get_current_demo_state():
    """读取演示状态：补上活动订单数，供前端面板展示。"""
    return get_demo_state(active_orders=count_active_orders())


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
    OrderEvent.query.delete()
    OrderPoint.query.delete()
    Order.query.delete()

    existing_carts = {cart.id: cart for cart in Cart.query.all()}
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
