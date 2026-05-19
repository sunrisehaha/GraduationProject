"""页面接口：负责托管前端打包后的页面和静态资源。"""

from pathlib import Path

from flask import send_from_directory

from backend.system.scheduler import start_background_workers

FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def ensure_workers_started(app):
    """确保后台调度线程已经启动。"""
    start_background_workers(app)


def register_page_api(app):
    """注册页面托管路由：生产环境直接返回 frontend/dist。"""

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
