"""项目配置模块：集中管理数据库地址和 ORM 相关配置。"""

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = BASE_DIR / "data" / "project.db"
DEFAULT_DATABASE_URI = f"sqlite:///{DATABASE_PATH}"


class Config:
    """应用配置：当前默认使用本地 SQLite 数据库。"""

    # 数据库连接地址：优先读环境变量，方便后续切测试库或线上库。
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URI)

    # 关闭对象变更追踪：项目现阶段不需要这项功能，关掉更省资源。
    SQLALCHEMY_TRACK_MODIFICATIONS = False
