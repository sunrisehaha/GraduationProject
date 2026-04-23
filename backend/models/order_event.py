"""订单事件表（order_events）：保存订单生命周期里的关键动作。

主表负责保存“当前状态”，事件表负责保存“发生过什么”。
这也是很多业务系统里很常见的建模方式。
"""

from datetime import datetime

from backend.extensions import db


class OrderEvent(db.Model):
    """订单事件模型：对应数据库里的 order_events 表。"""

    # 指定数据库表名。
    __tablename__ = "order_events"

    # 事件编号（主键）。
    id = db.Column(db.Integer, primary_key=True)

    # 所属订单编号：外键，指向 orders 表。
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)

    # 事件类型：例如 created、assigned、delivering、completed。
    event_type = db.Column(db.String(30), nullable=False, index=True)

    # 事件描述：给界面直接展示的中文说明。
    event_desc = db.Column(db.String(255), nullable=False)

    # 操作人：默认是 system，后续如果有人工作台操作也能记录。
    operator = db.Column(db.String(50), nullable=False, default="system")

    # 记录时间：事件发生并写入数据库的时间。
    create_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # 扩展信息 JSON：用于保存额外上下文，例如分配给哪台车。
    extra_json = db.Column(db.Text, nullable=True)

    # 反向关系：通过 event.order 可以拿到这条事件属于哪个订单。
    order = db.relationship("Order", back_populates="events")
