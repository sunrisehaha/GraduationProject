"""订单主表（orders）：保存订单的核心信息和当前状态。

这个文件用的是 SQLAlchemy 的 ORM 声明式写法。
可以把它理解成：我们用 Python 类来描述数据库里的一张表，
后续迁移工具会根据这里的定义生成真正的建表语句。
"""

from datetime import datetime

from backend.extensions import db


class Order(db.Model):
    """订单模型：对应数据库里的 orders 表。"""

    # 指定数据库表名，避免 SQLAlchemy 自动猜表名时不够直观。
    __tablename__ = "orders"

    # 订单编号（主键）：数据库内部使用的唯一编号。
    id = db.Column(db.Integer, primary_key=True)

    # 订单单号：给界面和业务展示使用的人类可读编号，要求唯一。
    order_no = db.Column(db.String(40), nullable=False, unique=True, index=True)

    # 订单状态：例如 pending、assigned、delivering、completed。
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)

    # 订单来源：区分手动创建和系统仿真生成。
    source = db.Column(db.String(20), nullable=False, default="manual")

    # 分配小车编号：关联 carts 表的 id，未分配时允许为空。
    assigned_cart_id = db.Column(db.Integer, db.ForeignKey("carts.id"), nullable=True, index=True)

    # 创建时间：订单第一次进入系统的时间。
    create_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # 取货时间：小车到达取货点并开始配送的时间。
    pickup_time = db.Column(db.DateTime, nullable=True)

    # 完成时间：订单配送完成的时间。
    complete_time = db.Column(db.DateTime, nullable=True)

    # 取消时间：如果后续支持取消订单，这里记录取消发生时间。
    cancel_time = db.Column(db.DateTime, nullable=True)

    # 备注：给业务扩展预留的补充说明字段。
    remark = db.Column(db.String(255), nullable=True)

    # 路径 JSON：当前把规划出来的路径直接存成 JSON 字符串，便于前端展示。
    path_json = db.Column(db.Text, nullable=False, default="[]")

    # 订单点位关系：一个订单会对应多个点位记录，例如起点、终点。
    # relationship 是 ORM 的关系声明，不会新建字段，但能让我们通过 order.points 直接拿到关联数据。
    points = db.relationship(
        "OrderPoint",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderPoint.sequence",
    )

    # 订单事件关系：一个订单会对应多条状态流转记录，例如创建、分配、完成。
    events = db.relationship(
        "OrderEvent",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderEvent.id",
    )
