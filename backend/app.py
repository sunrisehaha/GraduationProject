"""Flask 应用入口：负责创建应用、初始化扩展和注册接口。"""

import sys

from flask import Flask

from backend.api import register_api
from backend.business.bootstrap import init_database
from backend.system.config import Config
from backend.system.extensions import db, migrate


def create_app():
    """创建应用实例：载入配置、初始化数据库扩展、注册接口。"""
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)

    with app.app_context():
        if not is_migration_command():
            init_database()

    register_api(app)
    return app


def is_migration_command():
    """识别迁移命令：避免执行 flask db 命令时先自动建表。"""
    return "db" in sys.argv


app = create_app()
