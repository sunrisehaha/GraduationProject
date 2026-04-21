"""订单模型：保存订单主信息和调度结果。"""

from datetime import datetime

from backend.extensions import db


class Order(db.Model):
    """订单表：保存订单状态、关联小车和规划路径。"""

    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    order_no = db.Column(db.String(40), nullable=False, unique=True, index=True)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    source = db.Column(db.String(20), nullable=False, default="manual")
    assigned_cart_id = db.Column(db.Integer, db.ForeignKey("carts.id"), nullable=True, index=True)
    create_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    pickup_time = db.Column(db.DateTime, nullable=True)
    complete_time = db.Column(db.DateTime, nullable=True)
    cancel_time = db.Column(db.DateTime, nullable=True)
    remark = db.Column(db.String(255), nullable=True)
    path_json = db.Column(db.Text, nullable=False, default="[]")

    points = db.relationship(
        "OrderPoint",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderPoint.sequence",
    )
    events = db.relationship(
        "OrderEvent",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderEvent.id",
    )

