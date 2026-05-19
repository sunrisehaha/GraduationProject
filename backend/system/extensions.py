"""扩展模块：统一初始化数据库与迁移工具。"""
# extensions.py 是后端扩展对象的集中入口，主要提供 db 和 migrate，
# 让数据库模型、业务服务和 Flask 应用共用同一套数据库工具。

from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()
migrate = Migrate()

