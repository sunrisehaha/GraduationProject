from datetime import datetime

carts = [
    {
        "id": 1,
        "name": "Cart-1",
        "status": "idle",
        "x": 2,
        "y": 2
    },
    {
        "id": 2,
        "name": "Cart-2",
        "status": "idle",
        "x": 10,
        "y": 5
    }
]

orders = [
    {
        "id": 1,
        "start_point": {"x": 1, "y": 1},
        "end_point": {"x": 8, "y": 6},
        "status": "pending",
        "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
]


def create_order(start_point, end_point):
    """Create a new order and append it to the order list."""
    new_id = max([order["id"] for order in orders], default=0) + 1

    order = {
        "id": new_id,
        "start_point": start_point,
        "end_point": end_point,
        "status": "pending",
        "create_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    orders.append(order)
    return order