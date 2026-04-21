"""Flask 应用入口：负责初始化扩展、数据库和接口。"""

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
from backend.services.order_service import create_order, list_orders, serialize_order

FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def create_app():
    """创建应用：统一初始化配置、扩展和种子数据。"""
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
    """确保后台线程已启动。"""
    start_background_workers(app)


def is_migration_command():
    """识别迁移命令：避免迁移时先执行 create_all。"""
    return "db" in sys.argv


def register_routes(app):
    """注册全部路由：当前项目规模下直接集中管理。"""

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
        """返回全部订单数据。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(list_orders())

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
            order = create_order(start_point, end_point, source="manual")
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
