"""Flask 应用入口：负责应用初始化、页面托管和接口注册。"""

import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from backend.astar import find_path
from backend.config import Config
from backend.extensions import db, migrate
from backend.runtime import MAP_HEIGHT, MAP_WIDTH, OBSTACLES, state_lock
from backend.scheduler import start_background_workers
from backend.services.bootstrap_service import init_database
from backend.services.cart_service import list_carts
from backend.services.order_service import (
    create_order,
    get_order_by_id,
    get_order_detail,
    list_order_events,
    list_orders,
    list_orders_by_status,
    serialize_order,
)

FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def create_app():
    """ 创建应用实例：
        1. 载入配置
        2. 初始化数据库扩展
        3. 在非迁移命令下自动建表并注入默认数据
    """
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)

    with app.app_context():
        if not is_migration_command():
            init_database()

    register_routes(app)
    return app


def ensure_workers_started(app):
    # 确保后台线程已启动
    start_background_workers(app)


def is_migration_command():
    """识别迁移命令：避免执行 flask db 命令时先自动建表。"""
    return "db" in sys.argv


def register_routes(app):
    """注册全部路由：当前项目规模下先集中写在一个文件里。"""

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def index(path):
        """返回前端页面和静态资源。"""
        ensure_workers_started(app)

        # 前端资源直出：优先返回 dist 中真实存在的静态文件
        if path:
            asset_path = FRONTEND_DIST_DIR / path
            if asset_path.is_file():
                return send_from_directory(FRONTEND_DIST_DIR, path)

        # 前端入口兜底：不存在具体文件时统一回到 Vue 打包入口
        return send_from_directory(FRONTEND_DIST_DIR, "index.html")

    @app.route("/api/carts", methods=["GET"])
    def get_carts():
        """返回全部小车数据。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(list_carts())

    @app.route("/api/orders", methods=["GET"])
    def get_orders():
        """返回订单列表。

        这里支持通过 ?status=pending 这样的方式按状态过滤。
        不传 status 时默认返回全部订单。
        """
        ensure_workers_started(app)
        status = request.args.get("status")
        limit = request.args.get("limit", type=int)
        with state_lock:
            if status:
                return jsonify(list_orders_by_status(status, limit=limit))

            return jsonify(list_orders(limit=limit))

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

        if not start_point or not end_point:
            return jsonify({"error": "start_point and end_point are required"}), 400

        with state_lock:
            try:
                order = create_order(start_point, end_point, source="manual")
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

            return jsonify(serialize_order(order)), 201

    @app.route("/api/path", methods=["POST"])
    def get_path():
        """返回起点到终点的规划路径。"""
        ensure_workers_started(app)
        data = request.get_json() or {}
        start = data.get("start")
        end = data.get("end")

        if not start or not end:
            return jsonify({"error": "start and end are required"}), 400

        path = find_path(
            start=start,
            end=end,
            obstacles=OBSTACLES,
            width=MAP_WIDTH,
            height=MAP_HEIGHT,
        )
        return jsonify({"path": path})


app = create_app()
