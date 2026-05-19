"""演示接口：控制答辩演示模式和标准演示订单。"""

from flask import jsonify, request

from backend.api.page import ensure_workers_started
from backend.business.demo import (
    create_five_demo_orders,
    create_one_demo_order,
    get_current_demo_state,
    reset_demo_scene,
    set_demo_enabled,
)
from backend.system.runtime import state_lock


def register_demo_api(app):
    """注册演示控制相关接口。"""

    @app.route("/api/demo", methods=["GET"])
    def get_demo():
        """返回演示控制状态。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(get_current_demo_state())

    @app.route("/api/demo/mode", methods=["POST"])
    def set_demo_mode_view():
        """切换演示模式：演示模式会暂停自动仿真订单。"""
        ensure_workers_started(app)
        data = request.get_json() or {}
        with state_lock:
            return jsonify(set_demo_enabled(bool(data.get("enabled"))))

    @app.route("/api/demo/reset", methods=["POST"])
    def reset_demo():
        """重置演示场景：清空订单并让小车回到默认待命点。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(reset_demo_scene())

    @app.route("/api/demo/order-one", methods=["POST"])
    def add_one_demo_order():
        """创建一单标准演示订单。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(create_one_demo_order()), 201

    @app.route("/api/demo/order-five", methods=["POST"])
    def add_five_demo_orders():
        """创建五单标准演示订单。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(create_five_demo_orders()), 201
