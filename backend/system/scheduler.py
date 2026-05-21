"""调度模块：启动后台线程，持续驱动订单分配与小车移动。

这个文件现在只保留“线程循环”这层职责
真正的业务逻辑已下沉到 business/dispatch.py 里
"""

from threading import Thread
from time import sleep

from backend.business.dispatch import (
    advance_carts,
    create_simulation_order_if_needed,
    dispatch_pending_orders,
)
from backend.system.runtime import get_demo_speed, is_demo_simulation_paused, state_lock

DISPATCH_INTERVAL = 1.0         # 每 1 秒尝试分配订单
MOVE_INTERVAL = 0.8             # 每 0.8 秒推动小车移动一步
SIMULATION_INTERVAL = 6.0       # 每 6 秒尝试生成仿真订单
MAX_ACTIVE_ORDERS = 6           # 最多保持 6 个活动订单

_workers_started = False


def run_with_app_context(app, loop_func):
    """在线程中挂载应用上下文，保证数据库会话可用。"""
    with app.app_context():
        loop_func()


def sleep_by_demo_speed(base_interval):
    """按演示倍速缩短循环等待时间，让答辩演示节奏可控。"""
    speed = max(get_demo_speed(), 0.5)
    sleep(base_interval / speed)


def scheduler_loop():
    """持续分配待调度订单。"""
    while True:
        with state_lock:
            dispatch_pending_orders()
        sleep_by_demo_speed(DISPATCH_INTERVAL)


def movement_loop():
    """持续推进小车沿路径移动。"""
    while True:
        with state_lock:
            advance_carts()
        sleep_by_demo_speed(MOVE_INTERVAL)


def simulation_loop():
    """按固定频率生成仿真订单。"""
    while True:
        with state_lock:
            if not is_demo_simulation_paused():
                create_simulation_order_if_needed(MAX_ACTIVE_ORDERS)
        sleep_by_demo_speed(SIMULATION_INTERVAL)


def start_background_workers(app):
    """启动后台线程：整个应用生命周期内只执行一次。"""
    global _workers_started

    if _workers_started:
        return

    Thread(target=run_with_app_context, args=(app, scheduler_loop), daemon=True).start()
    Thread(target=run_with_app_context, args=(app, movement_loop), daemon=True).start()
    Thread(target=run_with_app_context, args=(app, simulation_loop), daemon=True).start()
    _workers_started = True
