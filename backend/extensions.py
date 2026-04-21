"""扩展模块：统一初始化数据库与迁移工具。"""

from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()
migrate = Migrate()

