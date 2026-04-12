def assign_order_to_cart(order, carts):
    """
    Placeholder for scheduling logic.
    This will be implemented later.
    """
    for cart in carts:
        if cart["status"] == "idle":
            return cart
    return None