"""订单点位表（order_points）：保存订单相关的地图坐标点。

这张表把起点、终点拆出来单独存，是为了后续更容易扩展：
以后如果一个订单有多个中转点，不需要推翻主表结构。
"""

from backend.extensions import db


class OrderPoint(db.Model):
    """订单点位模型：对应数据库里的 order_points 表。"""

    # 指定数据库表名。
    __tablename__ = "order_points"

    # 点位编号（主键）。
    id = db.Column(db.Integer, primary_key=True)

    # 所属订单编号：外键，指向 orders 表。
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)

    # 点位类型：例如 start 表示起点，end 表示终点。
    point_type = db.Column(db.String(20), nullable=False)

    # 横坐标：园区网格中的 x。
    x = db.Column(db.Integer, nullable=False)

    # 纵坐标：园区网格中的 y。
    y = db.Column(db.Integer, nullable=False)

    # 点位文本：保存“1栋101室、综合楼、快递出件口”这类人类可读地点名。
    # 第一版先把它直接挂在点位上，既能保留用户输入，也不需要额外建新表。
    label_text = db.Column(db.String(120), nullable=True)

    # 顺序号：用于控制多个点位的先后顺序。
    sequence = db.Column(db.Integer, nullable=False, default=0)

    # 反向关系：通过 point.order 可以拿到这个点位属于哪一个订单。
    order = db.relationship("Order", back_populates="points")
