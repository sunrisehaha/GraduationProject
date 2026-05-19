"""小车接口：给前端返回配送小车的实时状态。"""

from flask import jsonify

from backend.api.page import ensure_workers_started
from backend.business.cart import list_carts
from backend.system.runtime import state_lock


def register_cart_api(app):
    """注册小车相关接口。"""

    @app.route("/api/carts", methods=["GET"])
    def get_carts():
        """返回全部小车数据。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(list_carts())
