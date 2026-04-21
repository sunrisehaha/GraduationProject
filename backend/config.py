"""项目配置模块：集中管理数据库等基础配置。"""

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = BASE_DIR / "data" / "project.db"
DEFAULT_DATABASE_URI = f"sqlite:///{DATABASE_PATH}"


class Config:
    """应用配置：当前默认使用本地 SQLite 数据库。"""

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URI)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
