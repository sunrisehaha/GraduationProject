"""订单服务：封装订单创建、查询、序列化和事件记录。"""

import json
import random
from datetime import datetime

from backend.extensions import db
from backend.models import Order, OrderEvent, OrderPoint
from backend.runtime import MAP_HEIGHT, MAP_WIDTH, OBSTACLES


ACTIVE_ORDER_STATUSES = ["pending", "assigned", "to_pickup", "delivering"]


def now_text():
    """返回界面使用的时间文本。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _format_time(value):
    """格式化时间：前端继续沿用字符串展示。"""
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


def _load_path(path_text):
    """解析路径 JSON：统一返回列表。"""
    return json.loads(path_text or "[]")


def _order_points_map(order):
    """提取订单点位：便于组装前端结构。"""
    return {point.point_type: {"x": point.x, "y": point.y} for point in order.points}


def serialize_order(order):
    """序列化订单：保持前端原有字段不变。"""
    points = _order_points_map(order)
    return {
        "id": order.id,
        "order_no": order.order_no,
        "start_point": points.get("start"),
        "end_point": points.get("end"),
        "status": order.status,
        "create_time": _format_time(order.create_time),
        "pickup_time": _format_time(order.pickup_time),
        "complete_time": _format_time(order.complete_time),
        "cancel_time": _format_time(order.cancel_time),
        "assigned_cart_id": order.assigned_cart_id,
        "source": order.source,
        "remark": order.remark,
        "path": _load_path(order.path_json),
    }


def record_order_event(order, event_type, event_desc, operator="system", extra=None):
    """记录订单事件：所有状态流转都尽量留痕。"""
    db.session.add(
        OrderEvent(
            order=order,
            event_type=event_type,
            event_desc=event_desc,
            operator=operator,
            extra_json=json.dumps(extra, ensure_ascii=False) if extra is not None else None,
        )
    )


def generate_order_no():
    """生成订单号：先使用时间戳方案满足演示与管理需要。"""
    return f"ORD{datetime.now().strftime('%Y%m%d%H%M%S%f')}"


def create_order(start_point, end_point, source="manual", remark=None):
    """创建订单：同时写入订单主表、点位表和事件表。"""
    order = Order(
        order_no=generate_order_no(),
        status="pending",
        source=source,
        remark=remark,
        path_json="[]",
    )
    order.points = [
        OrderPoint(point_type="start", x=start_point["x"], y=start_point["y"], sequence=1),
        OrderPoint(point_type="end", x=end_point["x"], y=end_point["y"], sequence=2),
    ]
    db.session.add(order)
    record_order_event(order, "created", "订单已创建", extra={"source": source})
    db.session.commit()
    return order


def list_orders():
    """查询全部订单：按 id 升序返回。"""
    orders = Order.query.order_by(Order.id.asc()).all()
    return [serialize_order(order) for order in orders]


def get_order_by_id(order_id):
    """根据 id 查询订单对象。"""
    return Order.query.filter_by(id=order_id).first()


def get_pending_orders():
    """查询待分配订单。"""
    return Order.query.filter_by(status="pending").order_by(Order.id.asc()).all()


def count_active_orders():
    """统计活动订单数：仿真线程按此控制生成频率。"""
    return Order.query.filter(Order.status.in_(ACTIVE_ORDER_STATUSES)).count()


def get_order_start_end(order):
    """提取订单起终点：供调度路径规划使用。"""
    points = _order_points_map(order)
    return points.get("start"), points.get("end")


def set_order_assignment(order, cart, path, status):
    """写入订单分配结果：保持订单与小车状态同步。"""
    order.assigned_cart_id = cart.id
    order.status = status
    order.path_json = json.dumps(path, ensure_ascii=False)

    if status == "delivering" and order.pickup_time is None:
        order.pickup_time = datetime.utcnow()

    record_order_event(
        order,
        "assigned",
        f"订单已分配给小车 #{cart.id}",
        extra={"cart_id": cart.id, "status": status},
    )


def mark_order_delivering(order):
    """标记订单进入配送中。"""
    if order.status == "delivering":
        return

    order.status = "delivering"

    if order.pickup_time is None:
        order.pickup_time = datetime.utcnow()

    record_order_event(order, "delivering", "小车已取货，开始配送")


def complete_order(order):
    """标记订单完成。"""
    order.status = "completed"
    order.complete_time = datetime.utcnow()
    record_order_event(order, "completed", "订单已完成配送")


def obstacle_set():
    """返回障碍物集合：便于随机生成合法点位。"""
    return {(item["x"], item["y"]) for item in OBSTACLES}


def random_free_point():
    """生成空闲点位：避开障碍物。"""
    blocked = obstacle_set()

    while True:
        point = {
            "x": random.randint(0, MAP_WIDTH - 1),
            "y": random.randint(0, MAP_HEIGHT - 1),
        }

        if (point["x"], point["y"]) not in blocked:
            return point


def create_simulated_order():
    """创建仿真订单：供后台自动演示使用。"""
    start_point = random_free_point()
    end_point = random_free_point()

    while end_point == start_point:
        end_point = random_free_point()

    return create_order(start_point, end_point, source="simulated")

