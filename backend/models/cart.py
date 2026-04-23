"""小车主表（carts）：保存小车信息和当前运行状态。

这里既保存小车的基础信息，也保存运行时状态。
在项目现阶段这样做最简单，后面如果业务变复杂，再拆运行状态表也来得及。
"""

from datetime import datetime

from backend.extensions import db


class Cart(db.Model):
    """小车模型：对应数据库里的 carts 表。"""

    # 指定数据库表名。
    __tablename__ = "carts"

    # 小车编号（主键）。
    id = db.Column(db.Integer, primary_key=True)

    # 小车名称：例如 Cart-1。
    name = db.Column(db.String(50), nullable=False, unique=True)

    # 小车状态：例如 idle、to_pickup、delivering。
    status = db.Column(db.String(20), nullable=False, default="idle", index=True)

    # 当前横坐标：小车此刻所在网格 x。
    current_x = db.Column(db.Integer, nullable=False, default=0)

    # 当前纵坐标：小车此刻所在网格 y。
    current_y = db.Column(db.Integer, nullable=False, default=0)

    # 当前订单编号：如果正在执行订单，这里记录订单 id。
    current_order_id = db.Column(db.Integer, nullable=True)

    # 当前路径 JSON：把调度后的路径存成 JSON 字符串，便于轮询时直接返回前端。
    current_path_json = db.Column(db.Text, nullable=False, default="[]")

    # 路径索引：表示当前已经走到路径数组的第几个节点。
    path_index = db.Column(db.Integer, nullable=False, default=0)

    # 最后心跳时间：用于以后扩展在线检测或异常监控。
    last_heartbeat_time = db.Column(db.DateTime, nullable=True)

    # 创建时间：小车记录进入系统的时间。
    create_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
