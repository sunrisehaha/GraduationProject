"""调度接口：返回调度过程的解释信息。"""

from flask import jsonify

from backend.api.page import ensure_workers_started
from backend.system.runtime import get_last_dispatch_explanation, state_lock


def register_dispatch_api(app):
    """注册调度解释接口。"""

    @app.route("/api/dispatch/explanation", methods=["GET"])
    def get_dispatch_explanation():
        """返回最近一次调度解释：说明为什么这辆车接这个单。"""
        ensure_workers_started(app)
        with state_lock:
            return jsonify(get_last_dispatch_explanation() or {})
