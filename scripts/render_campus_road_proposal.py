"""按手绘逻辑生成新的 2D 路网方案图。"""

from pathlib import Path

import render_campus_2d_plan as base


PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_SVG = PROJECT_ROOT / "assets" / "campus" / "campus_2d_road_proposal.svg"
BOOKING_LOT_ID = "food_booking_lot_restaurant"
BOOKING_LOT_SITE_RECT = (35.8, 72.0, 31.8, 13.8)
BOOKING_LOT_PARKING_RECT = (37.2, 79.4, 9.8, 5.2)
BOOKING_LOT_BUILDING_RECT = (47.8, 73.0, 18.6, 12.0)
FOOD_DISPLAY_RECTS = {
    "food_japanese_vendor": (39.2, 59.4, 11.0, 8.0),
    "food_korean_bakery": (55.2, 59.4, 11.0, 8.0),
    BOOKING_LOT_ID: BOOKING_LOT_BUILDING_RECT,
}


def hroad(name, y, x1, x2, width=2.1):
    return {"id": name, "kind": "public", "direction": "h", "rect": (x1, y - width / 2, x2 - x1, width), "center": y}


def vroad(name, x, y1, y2, width=2.1):
    return {"id": name, "kind": "public", "direction": "v", "rect": (x - width / 2, y1, width, y2 - y1), "center": x}


def proposed_public_roads():
    """公共道路：外环 + 左中右三大片区的纵横连接。"""
    return [
        hroad("north_loop", 4.0, 3.0, 97.0, 2.2),
        hroad("south_loop", 86.0, 3.0, 97.0, 2.2),
        vroad("west_loop", 3.0, 4.0, 86.0, 2.2),
        vroad("east_loop", 97.0, 4.0, 86.0, 2.2),
        vroad("west_center_spine", 36.8, 4.0, 86.0, 2.2),
        hroad("west_office_front", 30.0, 3.0, 36.8, 2.0),
        hroad("west_library_front", 47.5, 3.0, 36.8, 2.0),
        hroad("west_property_front", 65.4, 3.0, 36.8, 2.0),
        vroad("food_middle_spine", 52.6, 4.0, 31.5, 2.0),
        vroad("center_east_spine", 67.4, 4.0, 86.0, 2.2),
        hroad("food_north_front", 20.4, 36.8, 67.4, 2.0),
        hroad("food_mid_front", 31.6, 36.8, 67.4, 2.0),
        hroad("park_south_food_front", 57.3, 36.8, 67.4, 2.0),
        hroad("food_south_front", 70.2, 36.8, 67.4, 2.0),
        vroad("apartment_center_spine", 82.1, 4.0, 40.5, 2.0),
        hroad("apartment_first_front", 24.0, 67.4, 97.0, 2.0),
        hroad("apartment_second_front", 40.5, 67.4, 97.0, 2.1),
        vroad("villa_west_inner_spine", 77.2, 40.5, 86.0, 1.8),
        vroad("villa_east_inner_spine", 86.0, 40.5, 86.0, 1.8),
        hroad("villa_row_1_front", 55.0, 67.4, 97.0, 2.0),
        hroad("villa_row_2_front", 70.2, 67.4, 97.0, 2.0),
    ]


def road_centerline(road):
    x, y, w, h = road["rect"]
    if road["direction"] == "h":
        return y + h / 2
    return x + w / 2


def target_public_road_y(x, y, roads):
    """找门口南侧最近的公共横路，作为专属入口路的连接点。"""
    candidates = []
    for road in roads:
        if road["direction"] != "h":
            continue
        rx, ry, rw, rh = road["rect"]
        center_y = ry + rh / 2
        if rx - 0.2 <= x <= rx + rw + 0.2 and center_y > y + 0.35:
            candidates.append(center_y)
    if candidates:
        return min(candidates, key=lambda value: value - y)
    return min(86.0, y + 3.0)


def door_for_building(item, roads):
    x, y, w, h = item["rect"]
    door_x = x + w / 2
    door_y = y + h + 0.45
    road_y = target_public_road_y(door_x, door_y, roads)
    if door_y >= road_y - 0.35:
        door_y = road_y - 1.0
    return {
        "id": f"access_{item['id']}",
        "name": item["name"],
        "building_id": item["id"],
        "x": door_x,
        "door_y": door_y,
        "road_y": road_y,
    }


def display_food_buildings(data):
    """订车场饭店的真实场地很大，方案图里把建筑主体和停车场分开表达。"""
    buildings = []
    for item in data["food_buildings"]:
        if item["id"] in FOOD_DISPLAY_RECTS:
            buildings.append({**item, "rect": FOOD_DISPLAY_RECTS[item["id"]]})
        else:
            buildings.append(item)
    return buildings


def all_buildings(data):
    return data["west_buildings"] + display_food_buildings(data) + data["apartments"] + data["villas"]


def render_access(access):
    x = access["x"]
    y1 = access["door_y"]
    y2 = access["road_y"]
    parts = [
        base.line_svg(x, y1, x, y2, "#cfd8e3", width=3.0, opacity=0.72),
        f'<circle cx="{base.sx(x):.1f}" cy="{base.sy(y1):.1f}" r="6.2" fill="#ef4444" fill-opacity="0.9" stroke="#ffffff" stroke-width="1.8"/>',
    ]
    return "\n".join(parts)


def render_building(item, fill, stroke, small=False):
    x, y, w, h = item["rect"]
    parts = [base.rect_svg(item["rect"], fill, stroke=stroke, width=1.2, radius=4)]
    if small:
        parts.append(base.text_svg(x + w / 2, y + h / 2, item["label"], size=9, color="#111827", weight=800))
    else:
        parts.append(base.text_svg(x + w / 2, y + h / 2 - 0.35, item["name"], size=11, color="#111827", weight=800))
        parts.append(base.text_svg(x + w / 2, y + h / 2 + 1.05, item["id"], size=7.5, color="#475569", weight=500))
    return "\n".join(parts)


def render_booking_lot_site():
    """订车场饭店周围是停车/绿化场地，不应该被看成建筑底座。"""
    x, y, w, h = BOOKING_LOT_SITE_RECT
    parking_x, parking_y, parking_w, parking_h = BOOKING_LOT_PARKING_RECT
    parts = [
        base.rect_svg(BOOKING_LOT_SITE_RECT, "#bbf7d0", opacity=0.2, stroke="#65a96f", width=1, radius=6, dash="6 5"),
        base.rect_svg(BOOKING_LOT_PARKING_RECT, "#4b5563", opacity=0.22, stroke="#475569", width=0.8, radius=4),
        base.text_svg(x + w * 0.48, y + 0.7, "订车场场地 / 停车区", size=8.6, color="#287045", weight=700),
    ]
    for index in range(4):
        slot_x = parking_x + 1.2 + index * 2.5
        parts.append(base.rect_svg((slot_x, parking_y + 0.75, 1.5, parking_h - 1.5), "#f8fafc", opacity=0.7, stroke="none", radius=1))
    return "\n".join(parts)


def render_food_base(item):
    """餐饮建筑底座只作为场地底色，必须画在建筑和道路下面。"""
    if item["id"] in {"food_japanese_cuisine", "food_paris_restaurant", "food_japanese_ramen", "food_samhui_restaurant"}:
        return base.rect_svg(base.expanded(item["rect"], 0.7), "#bbf7d0", opacity=0.28, stroke="#86c983", width=0.8, radius=5)
    if item["id"] in {"food_japanese_vendor", "food_korean_bakery"}:
        return base.rect_svg(base.expanded(item["rect"], 0.65), "#bbf7d0", opacity=0.34, stroke="#86c983", width=0.8, radius=5)
    return ""


def render_svg():
    data = base.load_scene_data()
    roads = proposed_public_roads()
    food_buildings = display_food_buildings(data)
    accesses = [door_for_building(item, roads) for item in all_buildings(data)]

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{base.SVG_WIDTH}" height="{base.SVG_HEIGHT}" viewBox="0 0 {base.SVG_WIDTH} {base.SVG_HEIGHT}">',
        "<style>",
        "text { font-family: 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif; dominant-baseline: middle; }",
        ".shadow { filter: drop-shadow(0 6px 16px rgba(15, 23, 42, 0.12)); }",
        "</style>",
        '<rect width="100%" height="100%" fill="#f6fbfd"/>',
        base.screen_text(36, 38, "智慧园区 2D 路网方案图", size=26, color="#102030", weight=800),
        base.screen_text(36, 68, "紫色为公共道路；浅灰短线为建筑专属入口小径；红点为南侧门口收/取件点。", size=14, color="#52677a"),
        base.rect_svg((0, 0, 100, 90), "#edf4ef", stroke="#94a3b8", width=1.5, radius=8),
    ]

    for x in range(0, 101, 10):
        parts.append(base.line_svg(x, 0, x, 90, "#d8e4eb", width=1, opacity=0.72))
        parts.append(base.text_svg(x, -2.3, f"x={x}", size=10, color="#64748b"))
        parts.append(base.text_svg(x, 92.4, f"x={x}", size=10, color="#64748b"))
    for y in range(0, 91, 10):
        parts.append(base.line_svg(0, y, 100, y, "#d8e4eb", width=1, opacity=0.72))
        parts.append(base.text_svg(-3.2, y, f"y={y}", size=10, color="#64748b"))
        parts.append(base.text_svg(103.2, y, f"y={y}", size=10, color="#64748b"))

    parts.extend(
        [
            base.text_svg(50, -5.3, "北 N / y=0", size=15, color="#0f172a", weight=800),
            base.text_svg(50, 96.2, "南 S / y=90", size=15, color="#0f172a", weight=800),
            base.text_svg(-6.6, 45, "西 W", size=15, color="#0f172a", weight=800),
            base.text_svg(106.5, 45, "东 E", size=15, color="#0f172a", weight=800),
        ]
    )

    # 分区底色。
    parts.append(base.rect_svg((6.4, 7.0, 27.2, 77.0), "#e9eef2", opacity=0.62, stroke="#cbd5e1", width=1, radius=5))
    parts.append(base.rect_svg((38.0, 6.5, 30.0, 79.0), "#eef4ef", opacity=0.72, stroke="#d3ded8", width=1, radius=5))
    parts.append(base.rect_svg((66.5, 8.0, 30.5, 75.0), "#bde5ad", opacity=0.42, stroke="#8fc985", width=1, radius=5))
    for item in food_buildings:
        food_base = render_food_base(item)
        if food_base:
            parts.append(food_base)
    parts.append(render_booking_lot_site())

    # 公共道路先画在建筑下面，形成完整路网底稿。
    for road in roads:
        parts.append(base.rect_svg(road["rect"], "#6d5fd7", stroke="#5548bb", width=0.8, opacity=0.52, radius=3))

    # 中央公园和底座。
    parts.append(base.rect_svg(data["central_park"], "#7acb82", stroke="#438653", width=1.6, opacity=0.84, radius=7))
    px, py, pw, ph = data["central_park"]
    parts.append(base.text_svg(px + pw / 2, py + ph / 2, "中央公园", size=13, color="#11431e", weight=800))

    # 建筑专属入口短路和门口点要压在公共道路上面。
    for access in accesses:
        parts.append(render_access(access))

    for item in data["west_buildings"]:
        parts.append(render_building(item, "#cbd5e1", "#64748b"))
    for item in food_buildings:
        parts.append(render_building(item, "#fef3c7", "#d97706"))
    for item in data["apartments"]:
        parts.append(render_building(item, "#dbeafe", "#3b82f6", small=True))
    for item in data["villas"]:
        parts.append(render_building(item, "#e5e7eb", "#6b7280", small=True))

    # 重新叠一遍红点，避免被建筑遮住。
    for access in accesses:
        parts.append(
            f'<circle cx="{base.sx(access["x"]):.1f}" cy="{base.sy(access["door_y"]):.1f}" '
            'r="6.2" fill="#ef4444" fill-opacity="0.9" stroke="#ffffff" stroke-width="1.8"/>'
        )

    legend_x = 1128
    legend_y = 122
    parts.append(f'<g class="shadow"><rect x="{legend_x - 24}" y="{legend_y - 34}" width="168" height="244" rx="12" fill="#ffffff" stroke="#dbe7ef"/></g>')
    parts.append(base.screen_text(legend_x, legend_y, "图例", size=17, color="#102030", weight=800))
    legends = [
        ("#6d5fd7", "公共道路"),
        ("#cfd8e3", "专属入口短路"),
        ("#ef4444", "建筑南侧门口"),
        ("#7acb82", "中央公园"),
        ("#cbd5e1", "公共建筑"),
        ("#fef3c7", "餐饮建筑"),
        ("#dbeafe", "公寓"),
        ("#e5e7eb", "别墅"),
    ]
    for index, (color, label) in enumerate(legends):
        y = legend_y + 32 + index * 24
        if label == "建筑南侧门口":
            parts.append(f'<circle cx="{legend_x + 11}" cy="{y - 3}" r="6" fill="{color}" stroke="#ffffff" stroke-width="1.5"/>')
        elif label == "专属入口短路":
            parts.append(f'<line x1="{legend_x}" y1="{y - 3}" x2="{legend_x + 24}" y2="{y - 3}" stroke="#cfd8e3" stroke-width="3" stroke-opacity="0.72"/>')
        else:
            parts.append(f'<rect x="{legend_x}" y="{y - 10}" width="22" height="14" rx="3" fill="{color}" fill-opacity="0.65" stroke="#d1d5db"/>')
        parts.append(base.screen_text(legend_x + 34, y - 3, label, size=12, color="#334155", weight=600))

    parts.append(base.screen_text(36, 1062, "说明：这张图用于展示当前路网方案；已同步到 Blender 生成脚本和 shared/campus_rules.json。", size=12, color="#64748b"))
    parts.append("</svg>")
    OUTPUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_SVG.write_text("\n".join(parts), encoding="utf-8")
    return OUTPUT_SVG


if __name__ == "__main__":
    print(render_svg())
