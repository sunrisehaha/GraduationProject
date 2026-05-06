"""初始化服务：负责建表和注入默认演示数据。"""

from sqlalchemy import text

from backend.campus_rules import DEFAULT_CARTS, service_point_payload
from backend.extensions import db
from backend.models import Cart, Order, OrderEvent, OrderPoint
from backend.runtime import in_map_bounds, is_free_point
from backend.services.order_service import create_order


def should_reset_demo_data():
    """识别旧版或脏演示数据：点位还停在旧地图里，或已经落到禁行区时就重置。"""
    carts = Cart.query.all()

    if not carts:
        return False

    cart_points = [(cart.current_x, cart.current_y) for cart in carts]
    order_points = db.session.execute(text("SELECT x, y FROM order_points")).all()
    all_points = cart_points + order_points

    if not all_points:
        return False

    if all(x < 40 and y < 35 for x, y in all_points):
        return True

    return any(
        not in_map_bounds({"x": x, "y": y}) or not is_free_point({"x": x, "y": y})
        for x, y in all_points
    )


def reset_demo_data():
    """重置演示数据：新地图需要新的小车分布和订单点位。"""
    OrderEvent.query.delete()
    OrderPoint.query.delete()
    Order.query.delete()
    Cart.query.delete()
    db.session.commit()


def ensure_order_point_label_column():
    """补齐地点文本列：让旧数据库也能保存“1栋101室”这类地点名。"""
    with db.engine.begin() as connection:
        columns = {
            row["name"]
            for row in connection.execute(text("PRAGMA table_info(order_points)")).mappings().all()
        }

        if "label_text" in columns:
            return

        connection.execute(text("ALTER TABLE order_points ADD COLUMN label_text VARCHAR(120)"))

    db.session.remove()


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
        start_point=service_point_payload("marker_express_pickup"),
        end_point=service_point_payload("marker_comprehensive_dropoff"),
        source="manual",
        remark="系统初始化订单",
    )


def init_database():
    """初始化数据库：先建表，再补默认小车和默认订单。"""
    db.create_all()
    ensure_order_point_label_column()

    if should_reset_demo_data():
        reset_demo_data()

    seed_carts()
    seed_orders()
