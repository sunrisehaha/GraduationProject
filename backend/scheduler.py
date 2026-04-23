"""调度模块：启动后台线程，持续驱动订单分配与小车移动。

这个文件现在只保留“线程循环”这层职责，
真正的业务逻辑已经下沉到 dispatch_service 里了。
"""

from threading import Thread
from time import sleep

from backend.runtime import state_lock
from backend.services.dispatch_service import (
    advance_carts,
    create_simulation_order_if_needed,
    dispatch_pending_orders,
)

DISPATCH_INTERVAL = 1.0
MOVE_INTERVAL = 0.8
SIMULATION_INTERVAL = 6.0
MAX_ACTIVE_ORDERS = 6

_workers_started = False


def run_with_app_context(app, loop_func):
    """在线程中挂载应用上下文，保证数据库会话可用。"""
    with app.app_context():
        loop_func()


def scheduler_loop():
    """持续分配待调度订单。"""
    while True:
        with state_lock:
            dispatch_pending_orders()
        sleep(DISPATCH_INTERVAL)


def movement_loop():
    """持续推进小车沿路径移动。"""
    while True:
        with state_lock:
            advance_carts()
        sleep(MOVE_INTERVAL)


def simulation_loop():
    """按固定频率生成仿真订单。"""
    while True:
        with state_lock:
            create_simulation_order_if_needed(MAX_ACTIVE_ORDERS)
        sleep(SIMULATION_INTERVAL)


def start_background_workers(app):
    """启动后台线程：整个应用生命周期内只执行一次。"""
    global _workers_started

    if _workers_started:
        return

    Thread(target=run_with_app_context, args=(app, scheduler_loop), daemon=True).start()
    Thread(target=run_with_app_context, args=(app, movement_loop), daemon=True).start()
    Thread(target=run_with_app_context, args=(app, simulation_loop), daemon=True).start()
    _workers_started = True
