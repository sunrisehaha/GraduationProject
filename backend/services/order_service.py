"""订单服务：集中处理订单查询、序列化和状态流转。

这里是“订单业务层”。
路由层只负责接收请求，真正的订单逻辑尽量都沉到这里。
"""

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
    """把关联点位转成字典：后面组装起点、终点时更顺手。"""
    return {point.point_type: {"x": point.x, "y": point.y} for point in order.points}


def serialize_order(order):
    """把 ORM 订单对象转成前端能直接消费的字典。"""
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


def serialize_order_event(event):
    """把 ORM 事件对象转成前端事件记录。"""
    return {
        "id": event.id,
        "order_id": event.order_id,
        "event_type": event.event_type,
        "event_desc": event.event_desc,
        "operator": event.operator,
        "create_time": _format_time(event.create_time),
        "extra": json.loads(event.extra_json) if event.extra_json else None,
    }


def record_order_event(order, event_type, event_desc, operator="system", extra=None):
    """记录订单事件：所有关键状态变化都尽量在这里留痕。"""
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
    """生成订单号：现阶段使用时间戳就足够稳定、直观。"""
    return f"ORD{datetime.now().strftime('%Y%m%d%H%M%S%f')}"


def create_order(start_point, end_point, source="manual", remark=None):
    """创建订单：主表、点位表、事件表一起写入。"""
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
    """查询全部订单：按编号升序返回，默认给监控页总览使用。"""
    orders = Order.query.order_by(Order.id.asc()).all()
    return [serialize_order(order) for order in orders]


def list_orders_by_status(status=None):
    """按状态查询订单。

    如果没有传状态，直接回全部订单；
    这样前端既能全量轮询，也能在需要时按状态过滤。
    """
    query = Order.query.order_by(Order.id.desc())

    if status and status != "all":
        query = query.filter_by(status=status)

    return [serialize_order(order) for order in query.all()]


def get_order_by_id(order_id):
    """根据 id 查询 ORM 订单对象：给服务层内部使用。"""
    return Order.query.filter_by(id=order_id).first()


def get_order_detail(order_id):
    """查询单个订单详情：供详情面板或后续详情页使用。"""
    order = get_order_by_id(order_id)
    return serialize_order(order) if order else None


def list_order_events(order_id, limit=5):
    """查询订单最近事件：默认仅返回最近几条。"""
    events = (
        OrderEvent.query.filter_by(order_id=order_id)
        .order_by(OrderEvent.create_time.desc(), OrderEvent.id.desc())
        .limit(limit)
        .all()
    )
    return [serialize_order_event(event) for event in events]


def get_pending_orders():
    """查询待分配订单：调度器每轮只需要处理这批订单。"""
    return Order.query.filter_by(status="pending").order_by(Order.id.asc()).all()


def count_active_orders():
    """统计活动订单数：仿真线程依赖它来控制新订单生成频率。"""
    return Order.query.filter(Order.status.in_(ACTIVE_ORDER_STATUSES)).count()


def get_order_start_end(order):
    """提取订单起终点：把关系表数据还原成更好用的结构。"""
    points = _order_points_map(order)
    return points.get("start"), points.get("end")


def set_order_assignment(order, cart, path, status):
    """写入订单分配结果：订单主表和事件表一起更新。"""
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
    """标记订单进入配送中：到达取货点后会走到这里。"""
    if order.status == "delivering":
        return

    order.status = "delivering"

    if order.pickup_time is None:
        order.pickup_time = datetime.utcnow()

    record_order_event(order, "delivering", "小车已取货，开始配送")


def complete_order(order):
    """标记订单完成：订单主状态和完成事件一起落库。"""
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
