"""路径接口：根据起点终点返回园区内的小车行驶路径。"""

from flask import jsonify, request

from backend.api.page import ensure_workers_started
from backend.campus.pathfinding import find_path
from backend.system.runtime import (
    MAP_HEIGHT,
    MAP_WIDTH,
    accessible_points_for_order,
    get_current_obstacles,
)


def register_path_api(app):
    """注册路径规划接口。"""

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
            obstacles=get_current_obstacles(),
            width=MAP_WIDTH,
            height=MAP_HEIGHT,
            accessible_points=accessible_points_for_order(start, end),
        )
        return jsonify({"path": path})
