from threading import Thread
from time import sleep

from backend.astar import find_path
from backend.models import (
    MAP_HEIGHT,
    MAP_WIDTH,
    OBSTACLES,
    carts,
    create_simulated_order,
    get_order_by_id,
    now_text,
    orders,
    state_lock,
)

DISPATCH_INTERVAL = 1.0
MOVE_INTERVAL = 0.8
SIMULATION_INTERVAL = 6.0
MAX_ACTIVE_ORDERS = 6

_workers_started = False


def build_full_path(cart, order):
    """Plan a complete path from cart position to order destination."""
    cart_position = {"x": cart["x"], "y": cart["y"]}
    path_to_start = find_path(
        start=cart_position,
        end=order["start_point"],
        obstacles=OBSTACLES,
        width=MAP_WIDTH,
        height=MAP_HEIGHT
    )
    path_to_end = find_path(
        start=order["start_point"],
        end=order["end_point"],
        obstacles=OBSTACLES,
        width=MAP_WIDTH,
        height=MAP_HEIGHT
    )

    if not path_to_start or not path_to_end:
        return []

    return path_to_start + path_to_end[1:]


def assign_order_to_cart(order, all_carts):
    """Assign the nearest idle cart to an order."""
    best_cart = None
    best_path = []
    best_distance = None

    for cart in all_carts:
        if cart["status"] != "idle":
            continue

        full_path = build_full_path(cart, order)
        if not full_path:
            continue

        distance = len(full_path)

        if best_distance is None or distance < best_distance:
            best_cart = cart
            best_path = full_path
            best_distance = distance

    if not best_cart:
        return None

    best_cart["current_order_id"] = order["id"]
    best_cart["current_path"] = best_path
    best_cart["path_index"] = 1 if len(best_path) > 1 else 0
    best_cart["status"] = (
        "delivering"
        if best_cart["x"] == order["start_point"]["x"] and best_cart["y"] == order["start_point"]["y"]
        else "to_pickup"
    )

    order["assigned_cart_id"] = best_cart["id"]
    order["path"] = best_path
    order["status"] = "delivering" if best_cart["status"] == "delivering" else "assigned"
    return best_cart


def dispatch_pending_orders():
    """Assign pending orders to idle carts."""
    for order in orders:
        if order["status"] != "pending":
            continue

        assign_order_to_cart(order, carts)


def complete_order(cart, order):
    """Finish a cart task and reset cart state."""
    order["status"] = "completed"
    order["complete_time"] = now_text()
    cart["status"] = "idle"
    cart["current_order_id"] = None
    cart["current_path"] = []
    cart["path_index"] = 0


def advance_carts():
    """Move all busy carts one step forward."""
    for cart in carts:
        if cart["status"] == "idle":
            continue

        path = cart.get("current_path", [])
        order = get_order_by_id(cart.get("current_order_id"))

        if not path or not order:
            cart["status"] = "idle"
            cart["current_order_id"] = None
            cart["current_path"] = []
            cart["path_index"] = 0
            continue

        if cart["path_index"] >= len(path):
            complete_order(cart, order)
            continue

        next_point = path[cart["path_index"]]
        cart["x"] = next_point["x"]
        cart["y"] = next_point["y"]
        cart["path_index"] += 1

        if (
            order["status"] == "assigned"
            and cart["x"] == order["start_point"]["x"]
            and cart["y"] == order["start_point"]["y"]
        ):
            order["status"] = "delivering"
            cart["status"] = "delivering"

        if cart["path_index"] >= len(path):
            complete_order(cart, order)


def scheduler_loop():
    """Continuously assign pending orders."""
    while True:
        with state_lock:
            dispatch_pending_orders()
        sleep(DISPATCH_INTERVAL)


def movement_loop():
    """Continuously move carts on their paths."""
    while True:
        with state_lock:
            advance_carts()
        sleep(MOVE_INTERVAL)


def simulation_loop():
    """Create random orders by time sequence for simulation."""
    while True:
        with state_lock:
            active_orders = [
                order for order in orders if order["status"] != "completed"
            ]

            if len(active_orders) < MAX_ACTIVE_ORDERS:
                create_simulated_order()
        sleep(SIMULATION_INTERVAL)


def start_background_workers():
    """Start scheduler, movement and simulation workers once."""
    global _workers_started

    if _workers_started:
        return

    Thread(target=scheduler_loop, daemon=True).start()
    Thread(target=movement_loop, daemon=True).start()
    Thread(target=simulation_loop, daemon=True).start()
    _workers_started = True
