from copy import deepcopy

from flask import Flask, jsonify, render_template, request

from astar import find_path
from models import MAP_HEIGHT, MAP_WIDTH, OBSTACLES, carts, create_order, orders, state_lock
from scheduler import start_background_workers

app = Flask(__name__)


def ensure_workers_started():
    """Ensure background scheduler workers are running."""
    start_background_workers()


@app.route("/")
def index():
    """Render the main page."""
    ensure_workers_started()
    return render_template("index.html")


@app.route("/api/carts", methods=["GET"])
def get_carts():
    """Return all cart data."""
    ensure_workers_started()
    with state_lock:
        return jsonify(deepcopy(carts))


@app.route("/api/orders", methods=["GET"])
def get_orders():
    """Return all order data."""
    ensure_workers_started()
    with state_lock:
        return jsonify(deepcopy(orders))


@app.route("/api/orders", methods=["POST"])
def add_order():
    """Create a new order."""
    ensure_workers_started()
    data = request.get_json() or {}

    start_point = data.get("start_point")
    end_point = data.get("end_point")

    if not start_point or not end_point:
        return jsonify({"error": "start_point and end_point are required"}), 400

    with state_lock:
        order = create_order(start_point, end_point, source="manual")
        return jsonify(deepcopy(order)), 201


@app.route("/api/path", methods=["POST"])
def get_path():
    """Return the planned path between start and end."""
    ensure_workers_started()
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
        height=MAP_HEIGHT
    )
    return jsonify({"path": path})


if __name__ == "__main__":
    app.run(port=5001, debug=True)
