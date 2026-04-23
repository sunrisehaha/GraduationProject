"""小车服务：集中处理小车查询、序列化和状态重置。"""

import json
from datetime import datetime

from backend.extensions import db
from backend.models import Cart


def _load_path(path_text):
    """解析路径 JSON：数据库里存的是字符串，前端需要的是数组。"""
    return json.loads(path_text or "[]")


def serialize_cart(cart):
    """把 ORM 小车对象转成前端能直接消费的字典。"""
    return {
        "id": cart.id,
        "name": cart.name,
        "status": cart.status,
        "x": cart.current_x,
        "y": cart.current_y,
        "current_order_id": cart.current_order_id,
        "current_path": _load_path(cart.current_path_json),
        "path_index": cart.path_index,
    }


def list_carts():
    """查询全部小车：监控页轮询时主要调用这个函数。"""
    carts = Cart.query.order_by(Cart.id.asc()).all()
    return [serialize_cart(cart) for cart in carts]


def get_idle_carts():
    """查询空闲小车：调度器分配订单时只需要这部分车。"""
    return Cart.query.filter_by(status="idle").order_by(Cart.id.asc()).all()


def get_busy_carts():
    """查询忙碌小车：推进移动时只需要处理非空闲车辆。"""
    return Cart.query.filter(Cart.status != "idle").order_by(Cart.id.asc()).all()


def touch_cart(cart):
    """刷新心跳时间：以后如果加离线检测，这个字段会很有用。"""
    cart.last_heartbeat_time = datetime.utcnow()


def reset_cart(cart):
    """重置小车执行状态：订单完成或异常时都要回到初始状态。"""
    cart.status = "idle"
    cart.current_order_id = None
    cart.current_path_json = "[]"
    cart.path_index = 0
    touch_cart(cart)


def save_carts():
    """提交小车状态：保留这个函数是为了让提交动作更显式。"""
    db.session.commit()
