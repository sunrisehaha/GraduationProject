"""演示控制服务：负责答辩时的场景重置和标准订单创建。"""

from backend.campus_rules import CAMPUS_RULES, DEFAULT_CARTS, service_point_payload
from backend.extensions import db
from backend.models import Cart, Order, OrderEvent, OrderPoint
from backend.runtime import (
    get_demo_state,
    clear_last_dispatch_explanation,
    set_current_demo_order_ids,
    set_demo_mode,
    set_simulation_paused,
)
from backend.services.order_service import count_active_orders, create_order, serialize_order


def build_demo_order_templates(demo_key):
    """从统一规则生成演示订单，避免演示点位和地图规则分叉。"""
    return [
        {
            "start_point": service_point_payload(item["startPointId"]),
            "end_point": service_point_payload(item["endPointId"]),
            "remark": item["remark"],
        }
        for item in CAMPUS_RULES["demoOrders"][demo_key]
    ]


def get_current_demo_state():
    """读取演示状态：补上活动订单数，供前端面板展示。"""
    return get_demo_state(active_orders=count_active_orders())


def set_demo_enabled(enabled):
    """切换演示模式：开启时暂停自动仿真，关闭时恢复自动仿真。"""
    set_demo_mode(enabled)

    if not enabled:
        set_simulation_paused(False)

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
