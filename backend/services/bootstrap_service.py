"""初始化服务：负责建表和注入默认演示数据。"""

from backend.extensions import db
from backend.models import Cart, Order, OrderEvent, OrderPoint
from backend.services.order_service import create_order


DEFAULT_CARTS = [
    {"id": 1, "name": "Cart-1", "x": 2, "y": 2},
    {"id": 2, "name": "Cart-2", "x": 12, "y": 3},
    {"id": 3, "name": "Cart-3", "x": 24, "y": 5},
    {"id": 4, "name": "Cart-4", "x": 36, "y": 4},
    {"id": 5, "name": "Cart-5", "x": 4, "y": 17},
    {"id": 6, "name": "Cart-6", "x": 14, "y": 16},
    {"id": 7, "name": "Cart-7", "x": 27, "y": 16},
    {"id": 8, "name": "Cart-8", "x": 37, "y": 18},
    {"id": 9, "name": "Cart-9", "x": 6, "y": 32},
    {"id": 10, "name": "Cart-10", "x": 18, "y": 31},
    {"id": 11, "name": "Cart-11", "x": 29, "y": 31},
    {"id": 12, "name": "Cart-12", "x": 36, "y": 30},
]


def should_reset_demo_data():
    """识别旧版 20x12 演示数据：只在升级地图后自动重置一次。"""
    carts = Cart.query.all()

    if not carts:
        return False

    return all(cart.current_x < 20 and cart.current_y < 12 for cart in carts)


def reset_demo_data():
    """重置演示数据：新地图需要新的小车分布和订单点位。"""
    OrderEvent.query.delete()
    OrderPoint.query.delete()
    Order.query.delete()
    Cart.query.delete()
    db.session.commit()


def seed_carts():
    """注入默认小车：只有空库时才执行，避免重复写入。"""
    if Cart.query.first():
        return

    for item in DEFAULT_CARTS:
        db.session.add(
            Cart(
                id=item["id"],
                name=item["name"],
                status="idle",
                current_x=item["x"],
                current_y=item["y"],
            )
        )

    db.session.commit()


def seed_orders():
    """注入默认订单：保证页面第一次打开就能看到业务数据。"""
    if Order.query.first():
        return

    create_order(
        start_point={"x": 33, "y": 12},
        end_point={"x": 24, "y": 21},
        source="manual",
        remark="系统初始化订单",
    )


def init_database():
    """初始化数据库：先建表，再补默认小车和默认订单。"""
    db.create_all()

    if should_reset_demo_data():
        reset_demo_data()

    seed_carts()
    seed_orders()
