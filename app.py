from backend.app import app


if __name__ == "__main__":
    # 根启动入口：保持原来的 python app.py 使用方式不变
    app.run(port=5001, debug=True)
