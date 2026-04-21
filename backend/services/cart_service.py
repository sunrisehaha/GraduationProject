"""小车服务：封装小车查询、序列化与状态重置。"""

import json
from datetime import datetime

from backend.extensions import db
from backend.models import Cart


def _load_path(path_text):
    """解析路径 JSON：统一处理空值场景。"""
    return json.loads(path_text or "[]")


def serialize_cart(cart):
    """序列化小车：保持前端现有字段不变。"""
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
    """查询全部小车：按 id 升序返回。"""
    carts = Cart.query.order_by(Cart.id.asc()).all()
    return [serialize_cart(cart) for cart in carts]


def get_idle_carts():
    """查询空闲小车：调度器分配订单时使用。"""
    return Cart.query.filter_by(status="idle").order_by(Cart.id.asc()).all()


def get_busy_carts():
    """查询忙碌小车：移动线程按此范围推进。"""
    return Cart.query.filter(Cart.status != "idle").order_by(Cart.id.asc()).all()


def touch_cart(cart):
    """刷新心跳时间：便于后续扩展在线状态。"""
    cart.last_heartbeat_time = datetime.utcnow()


def reset_cart(cart):
    """重置小车执行状态：订单完成或异常时复位。"""
    cart.status = "idle"
    cart.current_order_id = None
    cart.current_path_json = "[]"
    cart.path_index = 0
    touch_cart(cart)


def save_carts():
    """提交小车状态：统一保留一个显式入口。"""
    db.session.commit()

