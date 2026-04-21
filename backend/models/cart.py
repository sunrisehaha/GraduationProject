"""小车模型：保存小车主信息和当前执行状态。"""

from datetime import datetime

from backend.extensions import db


class Cart(db.Model):
    """小车表：当前同时承担主数据和调度运行状态。"""

    __tablename__ = "carts"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    status = db.Column(db.String(20), nullable=False, default="idle", index=True)
    current_x = db.Column(db.Integer, nullable=False, default=0)
    current_y = db.Column(db.Integer, nullable=False, default=0)
    current_order_id = db.Column(db.Integer, nullable=True)
    current_path_json = db.Column(db.Text, nullable=False, default="[]")
    path_index = db.Column(db.Integer, nullable=False, default=0)
    last_heartbeat_time = db.Column(db.DateTime, nullable=True)
    create_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

