"""从当前 Blender 场景脚本导出 2D 园区平面图。"""

import ast
import html
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCENE_SCRIPT = PROJECT_ROOT / "scripts" / "generate_campus_scene.py"
RULES_FILE = PROJECT_ROOT / "shared" / "campus_rules.json"
OUTPUT_SVG = PROJECT_ROOT / "assets" / "campus" / "campus_2d_plan.svg"

SCALE = 10
MAP_LEFT = 96
MAP_TOP = 88
MAP_WIDTH = 100 * SCALE
MAP_HEIGHT = 90 * SCALE
SVG_WIDTH = 1320
SVG_HEIGHT = 1110


def eval_node(node, env):
    """只求值脚本里的字面量和简单四则表达式，避免导入 bpy。"""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Tuple):
        return tuple(eval_node(item, env) for item in node.elts)
    if isinstance(node, ast.List):
        return [eval_node(item, env) for item in node.elts]
    if isinstance(node, ast.Dict):
        return {eval_node(key, env): eval_node(value, env) for key, value in zip(node.keys, node.values)}
    if isinstance(node, ast.Name):
        return env[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -eval_node(node.operand, env)
    if isinstance(node, ast.BinOp):
        left = eval_node(node.left, env)
        right = eval_node(node.right, env)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
    raise ValueError(f"unsupported node: {ast.dump(node, include_attributes=False)}")


def load_scene_data():
    tree = ast.parse(SCENE_SCRIPT.read_text(encoding="utf-8"))
    env = {}

    for statement in tree.body:
        if not isinstance(statement, ast.Assign):
            continue
        if len(statement.targets) != 1 or not isinstance(statement.targets[0], ast.Name):
            continue
        try:
            env[statement.targets[0].id] = eval_node(statement.value, env)
        except Exception:
            continue

    roads = []
    walks = []
    crosswalks = []
    for statement in tree.body:
        if not isinstance(statement, ast.FunctionDef) or statement.name != "add_roads":
            continue

        local_env = dict(env)
        for child in statement.body:
            if isinstance(child, ast.Assign) and len(child.targets) == 1 and isinstance(child.targets[0], ast.Name):
                try:
                    local_env[child.targets[0].id] = eval_node(child.value, local_env)
                except Exception:
                    continue
            elif isinstance(child, ast.Expr) and isinstance(child.value, ast.Call):
                call = child.value
                if getattr(call.func, "id", "") == "add_road_with_walks":
                    roads.append((eval_node(call.args[0], local_env), eval_node(call.args[1], local_env), "main"))
            elif isinstance(child, ast.For):
                if isinstance(child.iter, ast.Name):
                    values = local_env.get(child.iter.id, [])
                else:
                    try:
                        values = eval_node(child.iter, local_env)
                    except Exception:
                        values = []

                for inner in child.body:
                    if not isinstance(inner, ast.Expr) or not isinstance(inner.value, ast.Call):
                        continue
                    call = inner.value
                    func_name = getattr(call.func, "id", "")
                    if func_name == "add_road":
                        for item in values:
                            if len(item) < 2 or not isinstance(item[1], (tuple, list)):
                                continue
                            road_name, rect = item[0], item[1]
                            roads.append((road_name, rect, "outer"))
                    elif func_name == "add_road_with_walks":
                        for item in values:
                            if len(item) < 2 or not isinstance(item[1], (tuple, list)):
                                continue
                            road_name, rect = item[0], item[1]
                            roads.append((road_name, rect, "service"))
                    elif func_name == "add_plane_grid":
                        for item in values:
                            if len(item) < 2 or not isinstance(item[1], (tuple, list)):
                                continue
                            walk_name, rect = item[0], item[1]
                            walks.append((walk_name, rect))
                    elif func_name == "add_crosswalk":
                        for point, rotation in values:
                            crosswalks.append((point, rotation))

    return {
        "grid_cols": env["GRID_COLS"],
        "grid_rows": env["GRID_ROWS"],
        "west_buildings": env["WEST_BUILDING_DEFS"],
        "food_buildings": env["FOOD_BUILDING_DEFS"],
        "apartments": env["APARTMENT_DEFS"],
        "villas": env["VILLA_DEFS"],
        "central_park": env["CENTRAL_PARK_RECT"],
        "booking_plaza": env["BOOKING_LOT_RESTAURANT_PLAZA_RECT"],
        "roads": roads,
        "walks": walks,
        "crosswalks": crosswalks,
    }


def load_service_points():
    rules = json.loads(RULES_FILE.read_text(encoding="utf-8"))
    return rules.get("servicePoints", [])


def sx(x):
    return MAP_LEFT + x * SCALE


def sy(y):
    return MAP_TOP + y * SCALE


def rect_svg(rect, fill, stroke="none", width=1, opacity=1, radius=0, dash=None, extra=""):
    x, y, w, h = rect
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return (
        f'<rect x="{sx(x):.1f}" y="{sy(y):.1f}" width="{w * SCALE:.1f}" height="{h * SCALE:.1f}" '
        f'rx="{radius}" fill="{fill}" fill-opacity="{opacity}" stroke="{stroke}" '
        f'stroke-width="{width}"{dash_attr} {extra}/>'
    )


def line_svg(x1, y1, x2, y2, color, width=1, dash=None, opacity=1):
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return (
        f'<line x1="{sx(x1):.1f}" y1="{sy(y1):.1f}" x2="{sx(x2):.1f}" y2="{sy(y2):.1f}" '
        f'stroke="{color}" stroke-width="{width}" stroke-opacity="{opacity}"{dash_attr}/>'
    )


def text_svg(x, y, text, size=12, color="#1f2937", weight=500, anchor="middle", extra=""):
    return (
        f'<text x="{sx(x):.1f}" y="{sy(y):.1f}" text-anchor="{anchor}" '
        f'font-size="{size}" font-weight="{weight}" fill="{color}" {extra}>'
        f'{html.escape(str(text))}</text>'
    )


def screen_text(x, y, text, size=12, color="#1f2937", weight=500, anchor="start"):
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" '
        f'font-size="{size}" font-weight="{weight}" fill="{color}">'
        f'{html.escape(str(text))}</text>'
    )


def expanded(rect, padding):
    x, y, w, h = rect
    return (x - padding, y - padding, w + padding * 2, h + padding * 2)


def building_rect(item, fill, stroke, small=False):
    rect = item["rect"]
    title = item["name"]
    ident = item["id"]
    x, y, w, h = rect
    parts = [rect_svg(rect, fill, stroke=stroke, width=1.2, radius=4)]
    if small:
        parts.append(text_svg(x + w / 2, y + h / 2 - 0.25, item["label"], size=9, color="#111827", weight=700))
        parts.append(text_svg(x + w / 2, y + h / 2 + 0.95, ident, size=7, color="#475569", weight=500))
    else:
        parts.append(text_svg(x + w / 2, y + h / 2 - 0.35, title, size=11, color="#111827", weight=700))
        parts.append(text_svg(x + w / 2, y + h / 2 + 1.1, ident, size=8, color="#475569", weight=500))
    return "\n".join(parts)


def render_svg():
    data = load_scene_data()
    service_points = load_service_points()
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_WIDTH}" height="{SVG_HEIGHT}" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}">',
        "<style>",
        "text { font-family: 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif; dominant-baseline: middle; }",
        ".shadow { filter: drop-shadow(0 6px 16px rgba(15, 23, 42, 0.12)); }",
        "</style>",
        '<rect width="100%" height="100%" fill="#f6fbfd"/>',
        screen_text(36, 38, "智慧园区 2D 平面图", size=26, color="#102030", weight=800),
        screen_text(36, 68, "当前场景坐标：x 西→东，y 北→南；红色虚线是建议讨论路，不是当前已建道路。", size=14, color="#52677a"),
        rect_svg((0, 0, 100, 90), "#edf4ef", stroke="#94a3b8", width=1.5, radius=8),
    ]

    # 坐标网格。
    for x in range(0, 101, 10):
        parts.append(line_svg(x, 0, x, 90, "#d8e4eb", width=1, opacity=0.8))
        parts.append(text_svg(x, -2.3, f"x={x}", size=10, color="#64748b"))
        parts.append(text_svg(x, 92.4, f"x={x}", size=10, color="#64748b"))
    for y in range(0, 91, 10):
        parts.append(line_svg(0, y, 100, y, "#d8e4eb", width=1, opacity=0.8))
        parts.append(text_svg(-3.2, y, f"y={y}", size=10, color="#64748b"))
        parts.append(text_svg(103.2, y, f"y={y}", size=10, color="#64748b"))

    parts.extend(
        [
            text_svg(50, -5.3, "北 N / y=0", size=15, color="#0f172a", weight=800),
            text_svg(50, 96.2, "南 S / y=90", size=15, color="#0f172a", weight=800),
            text_svg(-6.6, 45, "西 W", size=15, color="#0f172a", weight=800),
            text_svg(106.5, 45, "东 E", size=15, color="#0f172a", weight=800),
        ]
    )

    # 大分区和地面材质。
    parts.append(rect_svg((2.6, 2.6, 94.8, 84.8), "#b8ddb1", opacity=0.42, stroke="#94c08d", width=1, radius=5))
    parts.append(rect_svg((6.4, 7.0, 27.2, 77.0), "#e9eef2", opacity=0.74, stroke="#cbd5e1", width=1, radius=5))
    parts.append(rect_svg((38.0, 6.5, 30.0, 79.0), "#eef4ef", opacity=0.72, stroke="#d3ded8", width=1, radius=5))
    parts.append(rect_svg((66.5, 8.0, 30.5, 75.0), "#bde5ad", opacity=0.52, stroke="#8fc985", width=1, radius=5))

    for item in data["west_buildings"]:
        parts.append(rect_svg(expanded(item["rect"], 0.7), "#f1f4f4", opacity=0.88, stroke="#d6dde1", width=1, radius=5))
    for item in data["food_buildings"]:
        if item["id"] in {"food_japanese_cuisine", "food_paris_restaurant", "food_japanese_ramen", "food_samhui_restaurant"}:
            parts.append(rect_svg(expanded(item["rect"], 0.55), "#f1f4f4", opacity=0.9, stroke="#d6dde1", width=1, radius=5))
        elif item["id"] in {"food_japanese_vendor", "food_korean_bakery", "food_booking_lot_restaurant"}:
            parts.append(rect_svg(expanded(item["rect"], 0.65), "#aee1a1", opacity=0.62, stroke="#86c983", width=1, radius=6))

    # 当前道路。
    for road_name, rect, kind in data["roads"]:
        color = "#30353a" if kind in {"outer", "main"} else "#42484e"
        parts.append(rect_svg(rect, color, stroke="#24292f", width=0.8, radius=2))
        x, y, w, h = rect
        if kind in {"outer", "main"}:
            if w >= h:
                parts.append(line_svg(x + 1.2, y + h / 2, x + w - 1.2, y + h / 2, "#f8fafc", width=1.1, dash="8 7", opacity=0.85))
            else:
                parts.append(line_svg(x + w / 2, y + 1.2, x + w / 2, y + h - 1.2, "#f8fafc", width=1.1, dash="8 7", opacity=0.85))

    for _, rect in data["walks"]:
        parts.append(rect_svg(rect, "#cdbf8b", stroke="#b9a96f", width=0.5, opacity=0.9, radius=2))

    # 建议新增的南北路，只做讨论标记。
    parts.append(rect_svg((66.9, 18.6, 2.4, 67.2), "#ef4444", stroke="#b91c1c", width=2, opacity=0.12, radius=3, dash="8 6"))
    parts.append(text_svg(70.3, 51.5, "建议新增南北路", size=12, color="#b91c1c", weight=800, anchor="start"))
    parts.append(text_svg(70.3, 53.7, "当前未建", size=10, color="#b91c1c", weight=600, anchor="start"))

    # 中央公园。
    parts.append(rect_svg(data["central_park"], "#7acb82", stroke="#438653", width=1.6, opacity=0.86, radius=7))
    px, py, pw, ph = data["central_park"]
    parts.append(text_svg(px + pw / 2, py + ph / 2 - 0.7, "中央公园", size=13, color="#11431e", weight=800))
    parts.append(text_svg(px + pw / 2, py + ph / 2 + 1.2, "park_center", size=9, color="#246238", weight=600))

    # 建筑。
    for item in data["west_buildings"]:
        parts.append(building_rect(item, "#cbd5e1", "#64748b"))
    for item in data["food_buildings"]:
        fill = "#fef3c7" if item["id"] in {"food_japanese_cuisine", "food_paris_restaurant", "food_japanese_ramen", "food_samhui_restaurant"} else "#bbf7d0"
        stroke = "#d97706" if fill == "#fef3c7" else "#22a866"
        parts.append(building_rect(item, fill, stroke))
    for item in data["apartments"]:
        parts.append(building_rect(item, "#dbeafe", "#3b82f6", small=True))
    for item in data["villas"]:
        parts.append(building_rect(item, "#e5e7eb", "#6b7280", small=True))

    # 业务点位。
    point_colors = {
        "hub": "#10b981",
        "pickup": "#06b6d4",
        "parking": "#f59e0b",
        "delivery": "#f97316",
        "gate": "#7dd3fc",
    }
    for point in service_points:
        p = point.get("point", {})
        if "x" not in p or "y" not in p:
            continue
        color = point.get("render", {}).get("markerColor") or point_colors.get(point.get("type"), "#f97316")
        parts.append(f'<circle cx="{sx(p["x"]):.1f}" cy="{sy(p["y"]):.1f}" r="4.4" fill="{color}" stroke="#ffffff" stroke-width="1.5"/>')

    # 图例。
    legend_x = 1130
    legend_y = 120
    parts.append(f'<g class="shadow"><rect x="{legend_x - 24}" y="{legend_y - 34}" width="160" height="315" rx="12" fill="#ffffff" stroke="#dbe7ef"/></g>')
    parts.append(screen_text(legend_x, legend_y, "图例", size=17, color="#102030", weight=800))
    legends = [
        ("#30353a", "主路 / 外环路"),
        ("#42484e", "服务路"),
        ("#cdbf8b", "公园步行路"),
        ("#f1f4f4", "大理石底座"),
        ("#aee1a1", "草地底座"),
        ("#7acb82", "中央公园"),
        ("#ef4444", "建议新增路"),
        ("#f97316", "配送收件点"),
    ]
    for index, (color, label) in enumerate(legends):
        y = legend_y + 32 + index * 31
        if label == "建议新增路":
            parts.append(f'<rect x="{legend_x}" y="{y - 10}" width="22" height="14" rx="3" fill="{color}" fill-opacity="0.16" stroke="#b91c1c" stroke-dasharray="6 4"/>')
        else:
            parts.append(f'<rect x="{legend_x}" y="{y - 10}" width="22" height="14" rx="3" fill="{color}" stroke="#d1d5db"/>')
        parts.append(screen_text(legend_x + 32, y - 2, label, size=12, color="#334155", weight=600))

    parts.append(screen_text(36, 1062, "说明：建筑矩形来自当前 Blender 生成脚本；道路矩形来自当前场景道路定义；红色虚线仅用于讨论下一步道路调整。", size=12, color="#64748b"))
    parts.append("</svg>")
    OUTPUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_SVG.write_text("\n".join(parts), encoding="utf-8")
    return OUTPUT_SVG


if __name__ == "__main__":
    print(render_svg())
