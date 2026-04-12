from flask import Flask, jsonify, render_template, request
from astar import find_path
from models import carts, orders, create_order

app = Flask(__name__)

MAP_WIDTH = 20
MAP_HEIGHT = 12
OBSTACLES = [
    {"x": 5, "y": 5},
    {"x": 5, "y": 6},
    {"x": 5, "y": 7},
    {"x": 12, "y": 3},
    {"x": 12, "y": 4}
]


@app.route("/")
def index():
    """Render the main page."""
    return render_template("index.html")


@app.route("/api/carts", methods=["GET"])
def get_carts():
    """Return all cart data."""
    return jsonify(carts)


@app.route("/api/orders", methods=["GET"])
def get_orders():
    """Return all order data."""
    return jsonify(orders)


@app.route("/api/orders", methods=["POST"])
def add_order():
    """Create a new order."""
    data = request.get_json() or {}

    start_point = data.get("start_point")
    end_point = data.get("end_point")

    if not start_point or not end_point:
        return jsonify({"error": "start_point and end_point are required"}), 400

    order = create_order(start_point, end_point)
    return jsonify(order), 201


@app.route("/api/path", methods=["POST"])
def get_path():
    """Return the planned path between start and end."""
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

if __name__ == '__main__':
    app.run(port=5001, debug=True)