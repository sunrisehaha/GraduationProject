"""订单接口：负责创建订单、查询订单和读取订单事件。"""

from flask import jsonify, request

from backend.api.page import ensure_workers_started
from backend.business.order import (
    create_order,
    get_order_by_id,
    get_order_detail,
    list_all_order_events,
    list_order_events,
    list_orders,
    list_orders_by_status,
    serialize_order,
)
from backend.system.runtime import state_lock


def register_order_api(app):
    """注册订单相关接口。"""

    @app.route("/api/orders", methods=["GET"])
    def get_orders():
        """返回订单列表，支持按状态过滤。"""
        ensure_workers_started(app)
        status = request.args.get("status")
        limit = request.args.get("limit", type=int)
        with state_lock:
            if status:
                return jsonify(list_orders_by_status(status, limit=limit))

            return jsonify(list_orders(limit=limit))

    @app.route("/api/order-events", methods=["GET"])
    def get_order_event_feed():
        """返回全部订单事件，给事件日志面板使用。"""
        ensure_workers_started(app)
        limit = request.args.get("limit", type=int)
        with state_lock:
            return jsonify(list_all_order_events(limit=limit))

    @app.route("/api/orders/<int:order_id>", methods=["GET"])
    def get_order_detail_view(order_id):
        """返回单个订单详情：给订单历史详情面板使用。"""
        ensure_workers_started(app)
        with state_lock:
            order = get_order_detail(order_id)
            if not order:
                return jsonify({"error": "order not found"}), 404

            return jsonify(order)

    @app.route("/api/orders/<int:order_id>/events", methods=["GET"])
    def get_order_events(order_id):
        """返回指定订单的最近事件。"""
        ensure_workers_started(app)
        with state_lock:
            if not get_order_by_id(order_id):
                return jsonify({"error": "order not found"}), 404

            return jsonify(list_order_events(order_id))

    @app.route("/api/orders", methods=["POST"])
    def add_order():
        """创建新订单。"""
        ensure_workers_started(app)
        data = request.get_json() or {}

        start_point = data.get("start_point")
        end_point = data.get("end_point")
        remark = data.get("remark")

        if not start_point or not end_point:
            return jsonify({"error": "start_point and end_point are required"}), 400

        with state_lock:
            try:
                order = create_order(start_point, end_point, source="manual", remark=remark)
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

            return jsonify(serialize_order(order)), 201
