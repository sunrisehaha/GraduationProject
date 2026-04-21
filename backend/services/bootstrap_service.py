"""初始化服务：建表并注入默认演示数据。"""

from backend.extensions import db
from backend.models import Cart, Order
from backend.services.order_service import create_order


DEFAULT_CARTS = [
    {"id": 1, "name": "Cart-1", "x": 2, "y": 2},
    {"id": 2, "name": "Cart-2", "x": 10, "y": 5},
    {"id": 3, "name": "Cart-3", "x": 1, "y": 8},
    {"id": 4, "name": "Cart-4", "x": 4, "y": 2},
    {"id": 5, "name": "Cart-5", "x": 7, "y": 10},
    {"id": 6, "name": "Cart-6", "x": 9, "y": 1},
    {"id": 7, "name": "Cart-7", "x": 11, "y": 8},
    {"id": 8, "name": "Cart-8", "x": 13, "y": 6},
    {"id": 9, "name": "Cart-9", "x": 16, "y": 2},
    {"id": 10, "name": "Cart-10", "x": 18, "y": 9},
]


def seed_carts():
    """注入默认小车：仅在空库时执行一次。"""
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
    """注入默认订单：保持现有页面首次进入时就有数据。"""
    if Order.query.first():
        return

    create_order(
        start_point={"x": 1, "y": 1},
        end_point={"x": 8, "y": 6},
        source="manual",
        remark="系统初始化订单",
    )


def init_database():
    """初始化数据库：建表并注入默认数据。"""
    db.create_all()
    seed_carts()
    seed_orders()

