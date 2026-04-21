import random
from datetime import datetime
from threading import RLock

MAP_WIDTH = 20
MAP_HEIGHT = 12
OBSTACLES = [
    {"x": 5, "y": 5},
    {"x": 5, "y": 6},
    {"x": 5, "y": 7},
    {"x": 12, "y": 3},
    {"x": 12, "y": 4}
]

state_lock = RLock()

carts = [
    {
        "id": 1,
        "name": "Cart-1",
        "status": "idle",
        "x": 2,
        "y": 2,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 2,
        "name": "Cart-2",
        "status": "idle",
        "x": 10,
        "y": 5,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 3,
        "name": "Cart-3",
        "status": "idle",
        "x": 1,
        "y": 8,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 4,
        "name": "Cart-4",
        "status": "idle",
        "x": 4,
        "y": 2,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 5,
        "name": "Cart-5",
        "status": "idle",
        "x": 7,
        "y": 10,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 6,
        "name": "Cart-6",
        "status": "idle",
        "x": 9,
        "y": 1,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 7,
        "name": "Cart-7",
        "status": "idle",
        "x": 11,
        "y": 8,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 8,
        "name": "Cart-8",
        "status": "idle",
        "x": 13,
        "y": 6,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 9,
        "name": "Cart-9",
        "status": "idle",
        "x": 16,
        "y": 2,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    },
    {
        "id": 10,
        "name": "Cart-10",
        "status": "idle",
        "x": 18,
        "y": 9,
        "current_order_id": None,
        "current_path": [],
        "path_index": 0
    }
]

orders = [
    {
        "id": 1,
        "start_point": {"x": 1, "y": 1},
        "end_point": {"x": 8, "y": 6},
        "status": "pending",
        "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "complete_time": None,
        "assigned_cart_id": None,
        "source": "manual",
        "path": []
    }
]


def now_text():
    """Return current time text for UI display."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_order(start_point, end_point, source="manual"):
    """Create a new order and append it to the order list."""
    new_id = max([order["id"] for order in orders], default=0) + 1

    order = {
        "id": new_id,
        "start_point": start_point,
        "end_point": end_point,
        "status": "pending",
        "create_time": now_text(),
        "complete_time": None,
        "assigned_cart_id": None,
        "source": source,
        "path": []
    }

    orders.append(order)
    return order


def get_order_by_id(order_id):
    """Find an order by id."""
    for order in orders:
        if order["id"] == order_id:
            return order
    return None


def obstacle_set():
    """Return obstacle positions as a set."""
    return {(item["x"], item["y"]) for item in OBSTACLES}


def random_free_point():
    """Return a random point that is not an obstacle."""
    blocked = obstacle_set()

    while True:
        point = {
            "x": random.randint(0, MAP_WIDTH - 1),
            "y": random.randint(0, MAP_HEIGHT - 1)
        }

        if (point["x"], point["y"]) not in blocked:
            return point


def create_simulated_order():
    """Create a random simulated order."""
    start_point = random_free_point()
    end_point = random_free_point()

    while end_point == start_point:
        end_point = random_free_point()

    return create_order(start_point, end_point, source="simulated")
