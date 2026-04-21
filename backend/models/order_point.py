"""订单点位模型：保存起点、终点以及未来扩展点位。"""

from backend.extensions import db


class OrderPoint(db.Model):
    """订单点位表：一个订单可对应多个顺序点位。"""

    __tablename__ = "order_points"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    point_type = db.Column(db.String(20), nullable=False)
    x = db.Column(db.Integer, nullable=False)
    y = db.Column(db.Integer, nullable=False)
    sequence = db.Column(db.Integer, nullable=False, default=0)

    order = db.relationship("Order", back_populates="points")

