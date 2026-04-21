"""订单事件模型：记录订单生命周期中的关键节点。"""

from datetime import datetime

from backend.extensions import db


class OrderEvent(db.Model):
    """订单事件表：后续可直接用于日志与轨迹展示。"""

    __tablename__ = "order_events"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    event_type = db.Column(db.String(30), nullable=False, index=True)
    event_desc = db.Column(db.String(255), nullable=False)
    operator = db.Column(db.String(50), nullable=False, default="system")
    create_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    extra_json = db.Column(db.Text, nullable=True)

    order = db.relationship("Order", back_populates="events")

