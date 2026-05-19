"""API 模块入口：集中注册前端会调用的所有后端接口。"""

from backend.api.cart import register_cart_api
from backend.api.demo import register_demo_api
from backend.api.dispatch import register_dispatch_api
from backend.api.order import register_order_api
from backend.api.page import register_page_api
from backend.api.path import register_path_api


def register_api(app):
    """把所有 API 和页面托管路由注册到 Flask 应用上。"""
    register_page_api(app)
    register_cart_api(app)
    register_order_api(app)
    register_demo_api(app)
    register_dispatch_api(app)
    register_path_api(app)
