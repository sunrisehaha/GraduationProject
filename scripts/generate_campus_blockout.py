"""园区低模 blockout 生成脚本：按 60 x 45 业务地图批量生成 Blender 主场景并导出 GLB。"""

import json
import math
from pathlib import Path

import bpy


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CAMPUS_RULES_PATH = PROJECT_ROOT / "shared" / "campus_rules.json"
CAMPUS_RULES = json.loads(CAMPUS_RULES_PATH.read_text(encoding="utf-8"))


def rect_tuple(rect):
    """把统一规则里的 JSON 矩形转成脚本内部使用的元组。"""
    return rect["x"], rect["y"], rect["width"], rect["height"]


GRID_COLS = CAMPUS_RULES["grid"]["cols"]
GRID_ROWS = CAMPUS_RULES["grid"]["rows"]
TILE_SIZE = 0.82
GROUND_Z = 0.0
ROAD_Z = 0.02
OPEN_SPACE_Z = 0.025
SIDEWALK_Z = 0.028
BUILDING_BASE_Z = 0.03
MARKING_Z = 0.031
MARKER_Z = 0.08

GRASS_BASE = "#bfd6a1"
GRASS_DEEP = "#9fbb78"
GRASS_LIGHT = "#d3e6bb"
GRASS_MOSS = "#aecb8d"
ROAD_ASPHALT = "#262c33"
ROAD_SERVICE = "#3b434c"
SIDEWALK_MAIN = "#dfd5c6"
SIDEWALK_WARM = "#ece2d3"
CURB_COLOR = "#d5d0c7"
PLAZA_BASE = "#ddd4c4"
PLAZA_INSET = "#cbbca7"
LOGISTICS_SURFACE = "#98a2a8"
PARKING_SURFACE = "#d7d2c7"

RESIDENTIAL_WALL = "#dcc37a"
RESIDENTIAL_WALL_LIGHT = "#e8d39a"
WALL_WARM = "#f2ede3"
WALL_LIGHT = "#e5e1d8"
STONE_LIGHT = "#d6d1c9"
FRAME_DARK = "#4f5760"
FRAME_DEEP = "#40474f"
GLASS_BLUE = "#8ea5b0"
GLASS_LIGHT = "#b8cbd4"
ROOF_DARK = "#6d7177"
ENTRY_DARK = "#706a63"
BRICK_ACCENT = "#ab4a46"
WOOD_ACCENT = "#b68c69"
METAL_LIGHT = "#c8c0b4"
SPORTS_AQUA = "#34b7a5"
SPORTS_ORANGE = "#ef9540"
LOGISTICS_GREEN = "#6f9b7b"
UTILITY_ORANGE = "#efb347"
PLAZA_RED = "#c94b45"

FONT_CANDIDATES = [
    Path("/System/Library/Fonts/STHeiti Light.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
]

OUTPUT_BLEND = PROJECT_ROOT / "frontend/public/scene/campus/campus.blend"
OUTPUT_GLB = PROJECT_ROOT / "frontend/public/scene/campus/campus.glb"

ROAD_RECTS = [(road["id"], rect_tuple(road["rect"])) for road in CAMPUS_RULES["roads"]]

BUILDING_SPECS = [
    (
        zone["id"],
        rect_tuple(zone["rect"]),
        zone["render"]["height"],
        zone["render"]["color"],
    )
    for zone in CAMPUS_RULES["zones"]
    if zone.get("reserveUse", "building") == "building"
]

OPEN_SPACE_SPECS = [
    (
        zone["id"],
        rect_tuple(zone["rect"]),
        zone.get("render", {}).get("color", "#bfe5c7"),
    )
    for zone in CAMPUS_RULES["zones"]
    if zone.get("reserveUse", "building") != "building"
]

TREE_ZONES = [
    (
        zone["id"],
        rect_tuple(zone["rect"]),
        zone.get("render", {}).get("treeCount", 4),
    )
    for zone in CAMPUS_RULES["zones"]
    if zone.get("reserveUse") == "trees"
]

SERVICE_MARKERS = [
    (
        point["id"],
        (point["point"]["x"], point["point"]["y"]),
        point.get("render", {}).get("markerColor", "#fb7185"),
    )
    for point in CAMPUS_RULES["servicePoints"]
    if point["type"] in ["gate", "hub", "pickup", "parking", "barrier"]
]


def clear_scene():
    """清空默认场景，避免旧对象残留到新 GLB。"""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in datablocks:
            if block.users == 0:
                datablocks.remove(block)


def ensure_collection(name):
    """为建筑、道路、树木分组，后面在 Blender 里也更容易继续细化。"""
    collection = bpy.data.collections.get(name)
    if collection:
        return collection

    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def world_center(x, y, width=1, height=1):
    """把业务网格矩形中心换算到 Blender 世界坐标。"""
    world_x = (x + (width - 1) / 2 - (GRID_COLS - 1) / 2) * TILE_SIZE
    # 业务 2D 地图的 y 轴向下，GLB 导入 Three.js 后 Blender Y 会映射到反向 Z。
    # 这里先翻转一次，让导出的静态园区和前端业务坐标保持同一个上下方向。
    world_y = -(y + (height - 1) / 2 - (GRID_ROWS - 1) / 2) * TILE_SIZE
    return world_x, world_y


def make_material(name, hex_color, roughness=0.68, metallic=0.02):
    """统一创建材质，保证导出的 GLB 颜色稳定。"""
    material = bpy.data.materials.get(name)
    if material:
        return material

    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    principled = next(
        (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )
    if principled is None:
        principled = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = hex_to_rgba(hex_color)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return material


def hex_to_rgba(hex_color):
    """把十六进制颜色转成 Blender 节点需要的 RGBA。"""
    color = hex_color.lstrip("#")
    red = int(color[0:2], 16) / 255
    green = int(color[2:4], 16) / 255
    blue = int(color[4:6], 16) / 255
    return (red, green, blue, 1.0)


def link_object(obj, collection):
    """把对象移到指定 collection，避免都堆在 Scene Collection。"""
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)


def add_plane(name, rect, color, z_offset, collection):
    """创建地面平面：道路、广场、绿地和停车区都用这一套。"""
    x, y, width, height = rect
    center_x, center_y = world_center(x, y, width, height)
    return add_plane_by_size(
        name=name,
        center_x=center_x,
        center_y=center_y,
        width=width * TILE_SIZE,
        height=height * TILE_SIZE,
        color=color,
        z_offset=z_offset,
        collection=collection,
    )


def add_plane_by_size(name, center_x, center_y, width, height, color, z_offset, collection, roughness=0.68):
    """按世界尺寸创建平面，方便补道路标线、建筑步道和广场铺装。"""
    bpy.ops.mesh.primitive_plane_add(location=(center_x, center_y, z_offset))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width / 2, height / 2, 1)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness))
    link_object(obj, collection)
    return obj


def add_box_by_size(
    name,
    center_x,
    center_y,
    width,
    depth,
    height,
    color,
    z_offset,
    collection,
    roughness=0.82,
    bevel_width=0.0,
):
    """按世界尺寸创建低矮体块，主要用于路缘石和花坛边界。"""
    bpy.ops.mesh.primitive_cube_add(location=(center_x, center_y, z_offset + height / 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width / 2, depth / 2, height / 2)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness))
    if bevel_width > 0:
        bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
        bevel.width = bevel_width
        bevel.segments = 2
    link_object(obj, collection)
    return obj


def add_box(name, rect, height, color, collection):
    """创建建筑体块：当前只追求占地、层高和辨识度。"""
    x, y, width, depth = rect
    center_x, center_y = world_center(x, y, width, depth)
    bpy.ops.mesh.primitive_cube_add(location=(center_x, center_y, BUILDING_BASE_Z + height / 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width * TILE_SIZE / 2, depth * TILE_SIZE / 2, height / 2)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=0.72))
    bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = 0.06
    bevel.segments = 2
    link_object(obj, collection)
    return obj


def add_box_on_rect(
    name,
    rect,
    height,
    color,
    collection,
    z_offset=BUILDING_BASE_Z,
    roughness=0.76,
    bevel_width=0.04,
):
    """按网格矩形创建建筑部件，支持浮点 rect，方便拼立面和入口体块。"""
    x, y, width, depth = rect
    center_x, center_y = world_center(x, y, width, depth)
    return add_box_by_size(
        name=name,
        center_x=center_x,
        center_y=center_y,
        width=width * TILE_SIZE,
        depth=depth * TILE_SIZE,
        height=height,
        color=color,
        z_offset=z_offset,
        collection=collection,
        roughness=roughness,
        bevel_width=bevel_width,
    )


def load_cjk_font():
    """优先加载系统中文字体，保证楼栋号和“武”字能稳定导出。"""
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            return bpy.data.fonts.load(str(candidate))
    return None


def add_cylinder_on_rect(
    name,
    rect,
    height,
    color,
    collection,
    z_offset=BUILDING_BASE_Z,
    vertices=24,
    roughness=0.76,
    bevel_width=0.03,
):
    """在矩形占地内生成圆形或椭圆体块，用来做主角建筑。"""
    x, y, width, depth = rect
    center_x, center_y = world_center(x, y, width, depth)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=1,
        depth=height,
        location=(center_x, center_y, z_offset + height / 2),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width * TILE_SIZE / 2, depth * TILE_SIZE / 2, 1)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness))
    if bevel_width > 0:
        bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
        bevel.width = bevel_width
        bevel.segments = 2
    link_object(obj, collection)
    return obj


def add_text_mesh(
    name,
    text,
    location,
    collection,
    color,
    rotation=(0, 0, 0),
    size=0.42,
    extrude=0.05,
    roughness=0.64,
):
    """用 Blender 文本对象生成低模字牌，适合屋顶编号和门头字。"""
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = extrude
    obj.data.bevel_depth = 0.006
    font = load_cjk_font()
    if font:
        obj.data.font = font

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.active_object
    mesh_obj.name = name
    mesh_obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness))
    link_object(mesh_obj, collection)
    return mesh_obj


def add_roof_number_badge(name, rect, roof_z, collection, label_text):
    """在住宅屋顶前侧补楼栋号，方便答辩演示时快速辨认。"""
    x, y, width, _ = rect
    badge_rect = (x + width / 2 - 0.98, y + 5.08, 1.96, 0.5)
    add_box_on_rect(
        f"{name}_badge_base",
        badge_rect,
        0.14,
        FRAME_DEEP,
        collection,
        z_offset=roof_z + 0.1,
        roughness=0.78,
        bevel_width=0.02,
    )
    center_x, center_y = world_center(x + width / 2, y + 5.32)
    add_text_mesh(
        f"{name}_badge_text",
        label_text,
        (center_x, center_y, roof_z + 0.22),
        collection,
        "#fff7e1",
        rotation=(0, 0, math.pi),
        size=0.42,
        extrude=0.035,
        roughness=0.52,
    )


def add_lightning_sign(name, center_x, center_y, base_z, collection):
    """用两个斜体块拼一个闪电符号，比直接用 emoji 更稳定。"""
    add_box_by_size(
        f"{name}_plate",
        center_x,
        center_y,
        1.02,
        0.14,
        0.82,
        FRAME_DEEP,
        base_z - 0.06,
        collection,
        roughness=0.72,
        bevel_width=0.02,
    )
    add_box_by_size(
        f"{name}_upper",
        center_x - 0.16,
        center_y + 0.04,
        0.26,
        0.82,
        0.14,
        UTILITY_ORANGE,
        base_z,
        collection,
        roughness=0.52,
        bevel_width=0.01,
    ).rotation_euler[2] = math.radians(28)
    add_box_by_size(
        f"{name}_lower",
        center_x + 0.16,
        center_y - 0.12,
        0.26,
        0.82,
        0.14,
        UTILITY_ORANGE,
        base_z,
        collection,
        roughness=0.52,
        bevel_width=0.01,
    ).rotation_euler[2] = math.radians(28)


def add_express_mascot(name, center_x, center_y, base_z, collection):
    """快递中心屋顶放一个低模快递吉祥物，增强项目识别度。"""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16,
        ring_count=10,
        radius=0.42,
        location=(center_x, center_y, base_z + 1.02),
    )
    head = bpy.context.active_object
    head.name = f"{name}_head"
    head.data.materials.append(make_material(f"mat_{name}_head", "#ffd59f", roughness=0.68))
    link_object(head, collection)

    add_box_by_size(
        f"{name}_body",
        center_x,
        center_y,
        0.92,
        0.56,
        0.94,
        "#ffbf5c",
        base_z + 0.22,
        collection,
        roughness=0.62,
        bevel_width=0.04,
    )
    add_box_by_size(
        f"{name}_bag",
        center_x + 0.36,
        center_y - 0.02,
        0.34,
        0.4,
        0.54,
        LOGISTICS_GREEN,
        base_z + 0.3,
        collection,
        roughness=0.64,
        bevel_width=0.02,
    )
    add_box_by_size(
        f"{name}_cap",
        center_x,
        center_y,
        0.6,
        0.42,
        0.1,
        "#e58f3a",
        base_z + 1.34,
        collection,
        roughness=0.58,
        bevel_width=0.01,
    )
    add_box_by_size(
        f"{name}_sign",
        center_x,
        center_y + 0.42,
        0.64,
        0.12,
        0.16,
        "#f7f4ec",
        base_z + 0.58,
        collection,
        roughness=0.5,
        bevel_width=0.01,
    )


def add_runner_icon(name, center_x, center_y, base_z, collection):
    """运动中心屋顶放极简运动小人，保持点睛但不过度卡通。"""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=12,
        ring_count=8,
        radius=0.22,
        location=(center_x, center_y, base_z + 1.28),
    )
    head = bpy.context.active_object
    head.name = f"{name}_head"
    head.data.materials.append(make_material(f"mat_{name}_head", SPORTS_ORANGE, roughness=0.56))
    link_object(head, collection)

    torso = add_box_by_size(
        f"{name}_torso",
        center_x,
        center_y,
        0.22,
        0.22,
        0.78,
        SPORTS_AQUA,
        base_z + 0.46,
        collection,
        roughness=0.58,
        bevel_width=0.01,
    )
    arm = add_box_by_size(
        f"{name}_arm",
        center_x + 0.02,
        center_y,
        0.82,
        0.08,
        0.08,
        SPORTS_ORANGE,
        base_z + 0.94,
        collection,
        roughness=0.52,
        bevel_width=0.01,
    )
    arm.rotation_euler[2] = math.radians(26)
    leg_front = add_box_by_size(
        f"{name}_leg_front",
        center_x + 0.12,
        center_y,
        0.64,
        0.08,
        0.08,
        SPORTS_AQUA,
        base_z + 0.28,
        collection,
        roughness=0.58,
        bevel_width=0.01,
    )
    leg_front.rotation_euler[2] = math.radians(-35)
    leg_back = add_box_by_size(
        f"{name}_leg_back",
        center_x - 0.12,
        center_y,
        0.64,
        0.08,
        0.08,
        SPORTS_AQUA,
        base_z + 0.3,
        collection,
        roughness=0.58,
        bevel_width=0.01,
    )
    leg_back.rotation_euler[2] = math.radians(38)
    torso.rotation_euler[2] = math.radians(12)

def add_roof_parapet(name, rect, roof_z, collection, color=ROOF_DARK):
    """给屋顶补一圈女儿墙，让盒子楼更像真实建筑。"""
    x, y, width, depth = rect
    strip = 0.16
    height = 0.18
    add_box_on_rect(
        f"{name}_parapet_north",
        (x, y, width, strip),
        height,
        color,
        collection,
        z_offset=roof_z,
        roughness=0.86,
        bevel_width=0.02,
    )
    add_box_on_rect(
        f"{name}_parapet_south",
        (x, y + depth - strip, width, strip),
        height,
        color,
        collection,
        z_offset=roof_z,
        roughness=0.86,
        bevel_width=0.02,
    )
    add_box_on_rect(
        f"{name}_parapet_west",
        (x, y, strip, depth),
        height,
        color,
        collection,
        z_offset=roof_z,
        roughness=0.86,
        bevel_width=0.02,
    )
    add_box_on_rect(
        f"{name}_parapet_east",
        (x + width - strip, y, strip, depth),
        height,
        color,
        collection,
        z_offset=roof_z,
        roughness=0.86,
        bevel_width=0.02,
    )


def add_floor_bands(prefix, x, y, width, levels, slab_depth, collection, rail_color=GLASS_LIGHT):
    """给住宅前立面补成组阳台板和栏杆。"""
    for index, level_z in enumerate(levels, start=1):
        add_box_on_rect(
            f"{prefix}_balcony_slab_{index}",
            (x, y, width, slab_depth),
            0.08,
            STONE_LIGHT,
            collection,
            z_offset=level_z,
            roughness=0.9,
            bevel_width=0.02,
        )
        add_box_on_rect(
            f"{prefix}_balcony_rail_{index}",
            (x + 0.08, y + slab_depth - 0.06, width - 0.16, 0.05),
            0.32,
            rail_color,
            collection,
            z_offset=level_z + 0.12,
            roughness=0.48,
            bevel_width=0.01,
        )


def add_window_bands(prefix, x, y, width, collection, heights):
    """用浅蓝灰窗带表达低模窗户，不做逐窗细分。"""
    for index, (z_offset, band_height) in enumerate(heights, start=1):
        add_box_on_rect(
            f"{prefix}_window_band_{index}",
            (x, y, width, 0.1),
            band_height,
            GLASS_BLUE,
            collection,
            z_offset=z_offset,
            roughness=0.38,
            bevel_width=0.01,
        )


def add_tree(name, x, y, scale, collection):
    """创建低模树：树冠名字里带 tree，Three.js 里会自动做轻微摆动。"""
    center_x, center_y = world_center(x, y)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=10,
        radius=0.12 * scale,
        depth=0.9 * scale,
        location=(center_x, center_y, 0.45 * scale),
    )
    trunk = bpy.context.active_object
    trunk.name = f"{name}_trunk"
    trunk.data.materials.append(make_material("mat_tree_trunk", "#8b5f3b", roughness=0.84))
    link_object(trunk, collection)

    bpy.ops.mesh.primitive_cone_add(
        vertices=8,
        radius1=0.48 * scale,
        radius2=0.08 * scale,
        depth=1.2 * scale,
        location=(center_x, center_y, 1.25 * scale),
        rotation=(0, 0, math.radians((x + y) * 13 % 360)),
    )
    crown = bpy.context.active_object
    crown.name = f"{name}_tree"
    crown.data.materials.append(make_material("mat_tree_crown", "#61b26f", roughness=0.88))
    link_object(crown, collection)


def add_marker(name, point, color, collection):
    """创建简单业务标记，让首页不用只靠悬浮特效认地点。"""
    x, y = point
    center_x, center_y = world_center(x, y)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16,
        radius=0.18,
        depth=0.12,
        location=(center_x, center_y, MARKER_Z),
    )
    marker = bpy.context.active_object
    marker.name = name
    marker.data.materials.append(make_material(f"mat_{name}", color, roughness=0.4, metallic=0.0))
    link_object(marker, collection)


def add_gate_booth(name, point, collection):
    """门岗位置补一个小门卫亭，让出入口更好认。"""
    x, y = point
    center_x, center_y = world_center(x, y)
    bpy.ops.mesh.primitive_cube_add(location=(center_x, center_y, 0.55))
    booth = bpy.context.active_object
    booth.name = f"{name}_booth"
    booth.scale = (0.32, 0.24, 0.52)
    booth.data.materials.append(make_material("mat_gate_booth", "#f4f7fb", roughness=0.42))
    link_object(booth, collection)


def add_parking_lines(collection):
    """停车预留区加几条浅色线，帮助用户一眼理解这里是待命区。"""
    line_material = make_material("mat_parking_line", "#fff8df", roughness=0.35)
    for index, x in enumerate(range(23, 31, 2)):
        center_x, center_y = world_center(x, 39, 1, 4)
        bpy.ops.mesh.primitive_plane_add(location=(center_x, center_y, OPEN_SPACE_Z + 0.001))
        line = bpy.context.active_object
        line.name = f"parking_line_{index + 1}"
        line.scale = (0.08, 4 * TILE_SIZE / 2, 1)
        line.data.materials.append(line_material)
        link_object(line, collection)


def add_rect_curbs(name, rect, collection, curb_width=0.18, curb_height=0.1, color=CURB_COLOR):
    """给矩形区域补一圈路缘石，让道路、草地和广场边界更真实。"""
    x, y, width, height = rect
    center_x, center_y = world_center(x, y, width, height)
    width_world = width * TILE_SIZE
    height_world = height * TILE_SIZE
    offset_x = width_world / 2 + curb_width / 2
    offset_y = height_world / 2 + curb_width / 2

    add_box_by_size(
        f"{name}_curb_top",
        center_x,
        center_y + offset_y,
        width_world + curb_width * 2,
        curb_width,
        curb_height,
        color,
        BUILDING_BASE_Z,
        collection,
        roughness=0.9,
    )
    add_box_by_size(
        f"{name}_curb_bottom",
        center_x,
        center_y - offset_y,
        width_world + curb_width * 2,
        curb_width,
        curb_height,
        color,
        BUILDING_BASE_Z,
        collection,
        roughness=0.9,
    )
    add_box_by_size(
        f"{name}_curb_left",
        center_x - offset_x,
        center_y,
        curb_width,
        height_world,
        curb_height,
        color,
        BUILDING_BASE_Z,
        collection,
        roughness=0.9,
    )
    add_box_by_size(
        f"{name}_curb_right",
        center_x + offset_x,
        center_y,
        curb_width,
        height_world,
        curb_height,
        color,
        BUILDING_BASE_Z,
        collection,
        roughness=0.9,
    )


def add_building_aprons(collection):
    """给建筑底部补一圈浅色步道，让住宅和公共楼更像正式小区。"""
    for name, rect, _, _ in BUILDING_SPECS:
        x, y, width, depth = rect
        center_x, center_y = world_center(x, y, width, depth)

        if "building_residential" in name:
            padding = 0.46
            color = SIDEWALK_WARM
        elif "hub_express" in name:
            padding = 0.52
            color = "#cfd3d3"
        elif "power_room" in name:
            padding = 0.32
            color = "#ece3d6"
        else:
            padding = 0.52
            color = SIDEWALK_MAIN

        apron_width = width * TILE_SIZE + padding
        apron_height = depth * TILE_SIZE + padding

        add_plane_by_size(
            name=f"{name}_apron",
            center_x=center_x,
            center_y=center_y,
            width=apron_width,
            height=apron_height,
            color=color,
            z_offset=SIDEWALK_Z,
            collection=collection,
            roughness=0.82,
        )
        add_rect_curbs(
            name=f"{name}_apron",
            rect=(x - padding / TILE_SIZE / 2, y - padding / TILE_SIZE / 2, width + padding / TILE_SIZE, depth + padding / TILE_SIZE),
            collection=collection,
            curb_width=0.12,
            curb_height=0.07,
            color="#d9d4ca",
        )


def add_residential_garden_bands(collection):
    """住宅楼之间补草地区和浅色步道，避免西侧住宅区像纯盒子堆。"""
    bands = [
        ("residential_garden_north", (8.2, 3.0, 1.6, 18.0), GRASS_LIGHT),
        ("residential_garden_south", (8.2, 25.0, 1.6, 18.0), GRASS_MOSS),
        ("residential_walk_north", (4.0, 12.0, 10.0, 1.2), "#efeadb"),
        ("residential_walk_mid", (4.0, 24.0, 10.0, 1.2), "#efeadb"),
        ("residential_walk_south", (4.0, 35.0, 10.0, 1.2), "#efeadb"),
    ]

    for name, (x, y, width, depth), color in bands:
        center_x, center_y = world_center(x, y, width, depth)
        add_plane_by_size(
            name=name,
            center_x=center_x,
            center_y=center_y,
            width=width * TILE_SIZE,
            height=depth * TILE_SIZE,
            color=color,
            z_offset=OPEN_SPACE_Z + 0.001,
            collection=collection,
            roughness=0.92,
        )


def add_residential_entry_paths(collection):
    """住宅楼和服务车道之间补入口步道，避免住宅区像直接贴着马路。"""
    for name, rect, _, _ in BUILDING_SPECS:
        if "building_residential" not in name:
            continue

        number = name.rsplit("_", 1)[-1]
        x, y, _, _ = rect
        center_x, center_y = world_center(x + 1.35, y + 5.65, 1.3, 2.0)
        add_plane_by_size(
            name=f"building_residential_{number}_entry_path",
            center_x=center_x,
            center_y=center_y,
            width=1.3 * TILE_SIZE,
            height=2.0 * TILE_SIZE,
            color=SIDEWALK_WARM,
            z_offset=SIDEWALK_Z + 0.001,
            collection=collection,
            roughness=0.84,
        )


def add_public_entry_paths(collection):
    """公共建筑前补更明确的入口铺地，让服务区看起来更像真实小区配套。"""
    paths = [
        ("building_resident_service_entry", (42.2, 8.5, 2.6, 1.1)),
        ("building_party_center_entry", (50.6, 8.5, 2.8, 1.1)),
        ("building_property_center_entry", (41.5, 20.4, 2.6, 1.1)),
        ("building_sports_center_entry", (42.8, 25.3, 3.0, 1.4)),
        ("building_comprehensive_entry", (52.4, 25.3, 3.0, 1.4)),
        ("building_power_room_entry", (55.2, 40.2, 1.8, 1.0)),
    ]

    for name, (x, y, width, height) in paths:
        center_x, center_y = world_center(x, y, width, height)
        add_plane_by_size(
            name=name,
            center_x=center_x,
            center_y=center_y,
            width=width * TILE_SIZE,
            height=height * TILE_SIZE,
            color=SIDEWALK_MAIN,
            z_offset=SIDEWALK_Z + 0.001,
            collection=collection,
            roughness=0.84,
        )


def add_residential_type_a(name, rect, height, collection):
    """A 型住宅：标准板楼，连续阳台和侧向楼梯间更明显。"""
    x, y, _, _ = rect
    facade_offset = 0.08
    body_rect = (x + 0.18, y + 0.18, 3.64, 5.28)
    add_box_on_rect(name, body_rect, height * 0.96, RESIDENTIAL_WALL, collection, roughness=0.74)
    add_box_on_rect(
        f"{name}_stair_tower",
        (x + 0.18 - facade_offset, y + 0.44, 0.62 + facade_offset, 4.8),
        height + 0.18,
        FRAME_DARK,
        collection,
        roughness=0.64,
    )
    add_box_on_rect(
        f"{name}_center_frame",
        (x + 1.5, y + 0.48, 1.02, 5.0),
        height * 0.74,
        STONE_LIGHT,
        collection,
        z_offset=BUILDING_BASE_Z + 0.45,
        roughness=0.8,
        bevel_width=0.02,
    )
    add_window_bands(
        name,
        x + 0.98,
        y + 5.12,
        2.15,
        collection,
        [(1.0, 0.42), (2.05, 0.42), (3.1, 0.42), (4.15, 0.42)],
    )
    add_floor_bands(name, x + 0.52, y + 5.38, 2.96, [0.95, 2.0, 3.05, 4.1], 0.16, collection)
    add_box_on_rect(
        f"{name}_entry_lobby",
        (x + 1.28, y + 5.36, 1.42, 0.28),
        0.62,
        ENTRY_DARK,
        collection,
        roughness=0.72,
        bevel_width=0.02,
    )
    add_box_on_rect(
        f"{name}_entry_canopy",
        (x + 1.12, y + 5.66, 1.74, 0.18),
        0.08,
        METAL_LIGHT,
        collection,
        z_offset=BUILDING_BASE_Z + 0.92,
        roughness=0.55,
        bevel_width=0.01,
    )
    add_box_on_rect(
        f"{name}_roof_room",
        (x + 1.48, y + 1.55, 1.04, 1.16),
        0.56,
        ROOF_DARK,
        collection,
        z_offset=BUILDING_BASE_Z + height * 0.96,
        roughness=0.72,
    )
    add_roof_parapet(name, body_rect, BUILDING_BASE_Z + height * 0.96, collection)


def add_residential_type_b(name, rect, height, collection):
    """B 型住宅：横向窗带更强，两端竖向深框更明显。"""
    x, y, _, _ = rect
    facade_offset = 0.1
    depth_offset = 0.08
    body_rect = (x + 0.14, y + 0.2, 3.72, 5.22)
    add_box_on_rect(name, body_rect, height * 0.95, RESIDENTIAL_WALL_LIGHT, collection, roughness=0.74)
    add_box_on_rect(
        f"{name}_frame_left",
        (x + 0.14 - facade_offset, y + 0.2 - depth_offset / 2, 0.42 + facade_offset, 5.22 + depth_offset),
        height,
        FRAME_DARK,
        collection,
        roughness=0.66,
    )
    add_box_on_rect(
        f"{name}_frame_right",
        (x + 3.44, y + 0.2 - depth_offset / 2, 0.42 + facade_offset, 5.22 + depth_offset),
        height,
        FRAME_DARK,
        collection,
        roughness=0.66,
    )
    add_window_bands(
        name,
        x + 0.78,
        y + 5.08,
        2.46,
        collection,
        [(0.98, 0.38), (2.02, 0.38), (3.06, 0.38), (4.1, 0.38)],
    )
    for index, offset_x in enumerate((0.62, 1.86), start=1):
        add_floor_bands(
            f"{name}_segment_{index}",
            x + offset_x,
            y + 5.34,
            0.9,
            [1.0, 2.08, 3.16, 4.24],
            0.18,
            collection,
            rail_color=GLASS_BLUE,
        )
    add_box_on_rect(
        f"{name}_entry_volume",
        (x + 1.22, y + 5.28, 1.56, 0.38),
        0.72,
        STONE_LIGHT,
        collection,
        roughness=0.76,
    )
    add_box_on_rect(
        f"{name}_entry_canopy",
        (x + 1.0, y + 5.68, 2.0, 0.18),
        0.08,
        METAL_LIGHT,
        collection,
        z_offset=BUILDING_BASE_Z + 1.0,
        roughness=0.52,
        bevel_width=0.01,
    )
    add_box_on_rect(
        f"{name}_roof_edge",
        (x + 0.22, y + 5.18, 3.52, 0.12),
        0.16,
        FRAME_DARK,
        collection,
        z_offset=BUILDING_BASE_Z + height * 0.95,
        roughness=0.78,
        bevel_width=0.02,
    )
    add_box_on_rect(
        f"{name}_roof_room",
        (x + 1.02, y + 1.72, 1.46, 1.08),
        0.5,
        ROOF_DARK,
        collection,
        z_offset=BUILDING_BASE_Z + height * 0.95,
        roughness=0.72,
    )
    add_roof_parapet(name, body_rect, BUILDING_BASE_Z + height * 0.95, collection)


def add_residential_type_c(name, rect, height, collection):
    """C 型住宅：转角和双入口更明显，立面节奏更活。"""
    x, y, _, _ = rect
    primary_rect = (x + 0.16, y + 0.22, 2.18, 5.24)
    side_rect = (x + 2.34, y + 0.58, 1.34, 4.88)
    add_box_on_rect(name, primary_rect, height * 0.95, RESIDENTIAL_WALL, collection, roughness=0.74)
    add_box_on_rect(
        f"{name}_side_mass",
        side_rect,
        height * 0.9,
        RESIDENTIAL_WALL_LIGHT,
        collection,
        roughness=0.76,
    )
    add_box_on_rect(
        f"{name}_vertical_core",
        (x + 1.54, y + 0.42, 0.58, 5.04),
        height * 0.78,
        STONE_LIGHT,
        collection,
        z_offset=BUILDING_BASE_Z + 0.48,
        roughness=0.82,
        bevel_width=0.02,
    )
    add_window_bands(
        f"{name}_left",
        x + 0.46,
        y + 5.06,
        0.92,
        collection,
        [(1.02, 0.38), (2.08, 0.38), (3.14, 0.38), (4.2, 0.38)],
    )
    add_window_bands(
        f"{name}_right",
        x + 2.58,
        y + 5.0,
        0.78,
        collection,
        [(1.16, 0.34), (2.32, 0.34), (3.48, 0.34)],
    )
    add_floor_bands(f"{name}_corner", x + 2.54, y + 5.28, 0.92, [1.1, 2.3, 3.5], 0.18, collection)
    add_box_on_rect(
        f"{name}_wood_accent",
        (x + 2.42, y + 5.06, 0.12, 0.12),
        height * 0.72,
        WOOD_ACCENT,
        collection,
        z_offset=BUILDING_BASE_Z + 0.62,
        roughness=0.68,
        bevel_width=0.01,
    )
    add_box_on_rect(
        f"{name}_wood_accent_2",
        (x + 3.32, y + 5.06, 0.12, 0.12),
        height * 0.68,
        WOOD_ACCENT,
        collection,
        z_offset=BUILDING_BASE_Z + 0.76,
        roughness=0.68,
        bevel_width=0.01,
    )
    add_box_on_rect(
        f"{name}_entry_left",
        (x + 0.56, y + 5.34, 0.82, 0.26),
        0.54,
        ENTRY_DARK,
        collection,
        roughness=0.74,
    )
    add_box_on_rect(
        f"{name}_entry_right",
        (x + 2.18, y + 5.34, 0.9, 0.26),
        0.54,
        ENTRY_DARK,
        collection,
        roughness=0.74,
    )
    add_box_on_rect(
        f"{name}_canopy",
        (x + 0.44, y + 5.64, 2.76, 0.16),
        0.08,
        METAL_LIGHT,
        collection,
        z_offset=BUILDING_BASE_Z + 0.92,
        roughness=0.52,
        bevel_width=0.01,
    )
    add_box_on_rect(
        f"{name}_roof_room",
        (x + 1.68, y + 1.68, 0.94, 1.22),
        0.5,
        ROOF_DARK,
        collection,
        z_offset=BUILDING_BASE_Z + height * 0.95,
        roughness=0.72,
    )
    add_roof_parapet(name, (x + 0.16, y + 0.22, 3.52, 5.24), BUILDING_BASE_Z + height * 0.95, collection)


def add_residential_building(name, rect, height, collection):
    """住宅楼分 3 类原型复用，保证变化足够明显。"""
    number = int(name.rsplit("_", 1)[-1])
    if number in {1, 4, 6}:
        add_residential_type_a(name, rect, height, collection)
    elif number in {2, 5, 8}:
        add_residential_type_b(name, rect, height, collection)
    else:
        add_residential_type_c(name, rect, height, collection)
    add_roof_number_badge(name, rect, BUILDING_BASE_Z + height * 0.95, collection, f"{number}栋")


def add_resident_service_building(name, rect, height, collection):
    x, y, _, _ = rect
    base_rect = (x + 0.22, y + 0.32, 6.56, 4.92)
    add_box_on_rect(name, base_rect, height * 0.9, WALL_WARM, collection, roughness=0.74)
    add_box_on_rect(f"{name}_wing_left", (x + 0.22, y + 0.42, 1.38, 4.7), height * 0.76, STONE_LIGHT, collection)
    add_box_on_rect(f"{name}_wing_right", (x + 5.4, y + 0.42, 1.38, 4.7), height * 0.76, STONE_LIGHT, collection)
    add_box_on_rect(f"{name}_lobby", (x + 2.2, y + 5.04, 2.4, 0.5), 2.2, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_canopy", (x + 2.0, y + 5.46, 2.8, 0.18), 0.08, METAL_LIGHT, collection, z_offset=BUILDING_BASE_Z + 1.32, roughness=0.52, bevel_width=0.01)
    add_window_bands(name, x + 1.0, y + 4.78, 5.0, collection, [(1.0, 0.34), (2.1, 0.34)])
    add_box_on_rect(f"{name}_roof_room", (x + 2.68, y + 1.54, 1.22, 1.14), 0.48, ROOF_DARK, collection, z_offset=BUILDING_BASE_Z + height * 0.9, roughness=0.72)
    add_roof_parapet(name, base_rect, BUILDING_BASE_Z + height * 0.9, collection)


def add_party_center_building(name, rect, height, collection):
    x, y, _, _ = rect
    base_rect = (x + 0.42, y + 0.46, 5.08, 5.08)
    add_cylinder_on_rect(name, base_rect, height * 0.88, WALL_WARM, collection, vertices=28, roughness=0.74)
    add_cylinder_on_rect(f"{name}_top_cap", (x + 0.86, y + 0.9, 4.2, 4.2), 0.26, WALL_LIGHT, collection, z_offset=BUILDING_BASE_Z + height * 0.88, vertices=28, roughness=0.82, bevel_width=0.01)
    add_cylinder_on_rect(f"{name}_podium", (x + 0.66, y + 0.7, 4.6, 4.6), 0.24, "#efe6da", collection, z_offset=BUILDING_BASE_Z - 0.01, vertices=28, roughness=0.9, bevel_width=0.01)
    add_box_on_rect(f"{name}_entry_lobby", (x + 1.86, y + 5.04, 2.24, 0.72), 2.08, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_entry_portal", (x + 1.56, y + 5.42, 2.84, 0.2), 0.18, PLAZA_RED, collection, z_offset=BUILDING_BASE_Z + 1.42, roughness=0.44, bevel_width=0.02)
    add_box_on_rect(f"{name}_entry_steps", (x + 1.78, y + 5.76, 2.4, 0.42), 0.12, "#eee5d8", collection, z_offset=SIDEWALK_Z + 0.01, roughness=0.92, bevel_width=0.01)
    add_box_on_rect(f"{name}_red_fin_left", (x + 1.42, y + 4.42, 0.2, 0.14), height * 0.78, BRICK_ACCENT, collection, z_offset=BUILDING_BASE_Z + 0.46, roughness=0.64, bevel_width=0.01)
    add_box_on_rect(f"{name}_red_fin_right", (x + 4.38, y + 4.42, 0.2, 0.14), height * 0.78, BRICK_ACCENT, collection, z_offset=BUILDING_BASE_Z + 0.46, roughness=0.64, bevel_width=0.01)
    add_box_on_rect(f"{name}_front_axis", (x + 2.7, y + 4.4, 0.18, 0.12), height * 0.72, PLAZA_RED, collection, z_offset=BUILDING_BASE_Z + 0.48, roughness=0.56, bevel_width=0.01)
    add_cylinder_on_rect(f"{name}_window_ring", (x + 0.92, y + 0.94, 4.0, 4.0), 0.18, GLASS_BLUE, collection, z_offset=BUILDING_BASE_Z + 1.42, vertices=28, roughness=0.38, bevel_width=0.01)
    add_cylinder_on_rect(f"{name}_window_ring_top", (x + 1.06, y + 1.08, 3.72, 3.72), 0.16, GLASS_BLUE, collection, z_offset=BUILDING_BASE_Z + 2.42, vertices=28, roughness=0.38, bevel_width=0.01)


def add_property_center_building(name, rect, height, collection):
    x, y, _, _ = rect
    base_rect = (x + 0.22, y + 0.24, 5.18, 4.9)
    add_box_on_rect(name, base_rect, height * 0.88, WALL_LIGHT, collection, roughness=0.76)
    add_box_on_rect(f"{name}_annex", (x + 4.72, y + 1.04, 0.82, 3.22), height * 0.65, STONE_LIGHT, collection, roughness=0.82)
    add_box_on_rect(f"{name}_entry_cube", (x + 1.92, y + 4.94, 1.38, 0.42), 1.55, FRAME_DARK, collection, roughness=0.68)
    add_box_on_rect(f"{name}_entry_glass", (x + 2.14, y + 5.02, 0.94, 0.28), 1.32, GLASS_LIGHT, collection, roughness=0.4)
    add_box_on_rect(f"{name}_canopy", (x + 1.78, y + 5.34, 1.66, 0.16), 0.08, METAL_LIGHT, collection, z_offset=BUILDING_BASE_Z + 1.0, roughness=0.52, bevel_width=0.01)
    add_window_bands(name, x + 0.86, y + 4.72, 3.56, collection, [(1.0, 0.34), (2.0, 0.34)])
    add_roof_parapet(name, base_rect, BUILDING_BASE_Z + height * 0.88, collection)


def add_express_hub_building(name, rect, height, collection):
    x, y, _, _ = rect
    hall_rect = (x + 0.34, y + 0.34, 9.12, 5.56)
    add_box_on_rect(name, hall_rect, height * 0.86, WALL_LIGHT, collection, roughness=0.78)
    add_box_on_rect(f"{name}_office", (x + 6.38, y + 3.62, 2.6, 2.0), height * 0.7, STONE_LIGHT, collection, roughness=0.74)
    add_box_on_rect(f"{name}_dock_canopy", (x + 0.1, y + 0.64, 0.22, 4.92), 0.18, METAL_LIGHT, collection, z_offset=BUILDING_BASE_Z + 2.0, roughness=0.58, bevel_width=0.01)
    for index, door_y in enumerate((0.82, 2.2, 3.58), start=1):
        add_box_on_rect(
            f"{name}_dock_door_{index}",
            (x + 0.3, y + door_y, 0.08, 0.98),
            1.34,
            FRAME_DARK,
            collection,
            z_offset=BUILDING_BASE_Z + 0.22,
            roughness=0.7,
            bevel_width=0.01,
        )
    add_box_on_rect(f"{name}_front_glass", (x + 7.02, y + 5.54, 1.86, 0.24), 1.22, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_front_canopy", (x + 6.82, y + 5.8, 2.26, 0.16), 0.08, METAL_LIGHT, collection, z_offset=BUILDING_BASE_Z + 0.96, roughness=0.52, bevel_width=0.01)
    add_box_on_rect(f"{name}_roof_strip", (x + 2.2, y + 1.02, 4.8, 1.0), 0.22, LOGISTICS_GREEN, collection, z_offset=BUILDING_BASE_Z + height * 0.86, roughness=0.7)
    center_x, center_y = world_center(x + 4.66, y + 2.08)
    add_express_mascot(f"{name}_mascot", center_x, center_y, BUILDING_BASE_Z + height * 0.86, collection)
    add_roof_parapet(name, hall_rect, BUILDING_BASE_Z + height * 0.86, collection)


def add_sports_center_building(name, rect, height, collection):
    x, y, _, _ = rect
    base_rect = (x + 0.24, y + 0.4, 7.46, 5.92)
    add_box_on_rect(name, base_rect, height * 0.8, WALL_LIGHT, collection, roughness=0.76)
    add_box_on_rect(f"{name}_glass_hall", (x + 1.72, y + 5.72, 3.82, 0.48), 2.2, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_roof_band", (x + 2.04, y + 1.34, 3.16, 3.4), 0.7, SPORTS_AQUA, collection, z_offset=BUILDING_BASE_Z + height * 0.8, roughness=0.68)
    add_box_on_rect(f"{name}_accent_left", (x + 0.42, y + 5.36, 0.22, 0.12), height * 0.56, SPORTS_AQUA, collection, z_offset=BUILDING_BASE_Z + 0.54, roughness=0.6)
    add_box_on_rect(f"{name}_accent_right", (x + 7.1, y + 5.36, 0.22, 0.12), height * 0.5, SPORTS_ORANGE, collection, z_offset=BUILDING_BASE_Z + 0.7, roughness=0.6)
    add_box_on_rect(f"{name}_entry_canopy", (x + 1.52, y + 6.0, 4.22, 0.16), 0.08, METAL_LIGHT, collection, z_offset=BUILDING_BASE_Z + 1.18, roughness=0.52, bevel_width=0.01)
    add_window_bands(name, x + 0.84, y + 5.44, 5.96, collection, [(0.98, 0.38), (1.94, 0.38)])
    center_x, center_y = world_center(x + 3.9, y + 2.04)
    add_runner_icon(f"{name}_runner", center_x, center_y, BUILDING_BASE_Z + height * 0.8, collection)
    gate_x, gate_y = world_center(x + 3.72, y + 6.02)
    add_text_mesh(
        f"{name}_wu_sign",
        "武",
        (gate_x, gate_y, BUILDING_BASE_Z + 1.38),
        collection,
        SPORTS_ORANGE,
        rotation=(0, 0, math.pi),
        size=0.66,
        extrude=0.05,
        roughness=0.52,
    )
    add_box_on_rect(f"{name}_wu_backplate", (x + 3.0, y + 5.92, 1.44, 0.16), 0.14, FRAME_DEEP, collection, z_offset=BUILDING_BASE_Z + 1.18, roughness=0.66, bevel_width=0.01)
    add_roof_parapet(name, base_rect, BUILDING_BASE_Z + height * 0.8, collection)


def add_comprehensive_building(name, rect, height, collection):
    x, y, _, _ = rect
    ellipse_rect = (x + 0.3, y + 0.42, 7.34, 5.5)
    add_cylinder_on_rect(name, ellipse_rect, height * 0.86, STONE_LIGHT, collection, vertices=30, roughness=0.74)
    add_cylinder_on_rect(f"{name}_podium", (x + 0.72, y + 0.9, 6.5, 4.48), 0.24, "#ebe4d9", collection, z_offset=BUILDING_BASE_Z - 0.01, vertices=30, roughness=0.9, bevel_width=0.01)
    add_cylinder_on_rect(f"{name}_glass_ring", (x + 0.92, y + 1.12, 6.1, 4.1), 0.18, GLASS_BLUE, collection, z_offset=BUILDING_BASE_Z + 1.28, vertices=30, roughness=0.38, bevel_width=0.01)
    add_cylinder_on_rect(f"{name}_glass_ring_top", (x + 1.14, y + 1.42, 5.68, 3.58), 0.18, GLASS_BLUE, collection, z_offset=BUILDING_BASE_Z + 2.38, vertices=30, roughness=0.38, bevel_width=0.01)
    add_box_on_rect(f"{name}_entry_lobby", (x + 2.3, y + 5.38, 3.38, 0.74), 2.48, FRAME_DEEP, collection, roughness=0.68)
    add_box_on_rect(f"{name}_entry_glass", (x + 2.68, y + 5.58, 2.62, 0.3), 1.98, GLASS_LIGHT, collection, roughness=0.4)
    add_box_on_rect(f"{name}_entry_canopy", (x + 2.06, y + 5.94, 3.86, 0.18), 0.14, METAL_LIGHT, collection, z_offset=BUILDING_BASE_Z + 1.48, roughness=0.5, bevel_width=0.01)
    add_box_on_rect(f"{name}_entry_steps", (x + 2.42, y + 6.12, 3.1, 0.34), 0.12, "#eee7db", collection, z_offset=SIDEWALK_Z + 0.01, roughness=0.92, bevel_width=0.01)
    add_cylinder_on_rect(f"{name}_roof_cap", (x + 1.64, y + 1.64, 4.7, 2.7), 0.34, ROOF_DARK, collection, z_offset=BUILDING_BASE_Z + height * 0.86, vertices=30, roughness=0.72, bevel_width=0.01)
    add_box_on_rect(f"{name}_roof_crown", (x + 2.84, y + 2.36, 2.22, 1.18), 0.24, FRAME_DEEP, collection, z_offset=BUILDING_BASE_Z + height * 0.86 + 0.26, roughness=0.68, bevel_width=0.01)


def add_power_room_building(name, rect, height, collection):
    x, y, _, _ = rect
    base_rect = (x + 0.24, y + 0.4, 3.5, 3.14)
    add_box_on_rect(name, base_rect, height * 0.76, STONE_LIGHT, collection, roughness=0.82)
    for index, strip_x in enumerate((0.46, 1.12, 1.78, 2.44), start=1):
        add_box_on_rect(
            f"{name}_louver_{index}",
            (x + strip_x, y + 3.18, 0.22, 0.08),
            1.02,
            FRAME_DARK,
            collection,
            z_offset=BUILDING_BASE_Z + 0.42,
            roughness=0.68,
            bevel_width=0.01,
        )
    add_box_on_rect(f"{name}_entry", (x + 1.26, y + 3.42, 1.0, 0.18), 0.82, ENTRY_DARK, collection, roughness=0.72)
    add_box_on_rect(f"{name}_roof_vent", (x + 1.48, y + 1.3, 0.9, 0.8), 0.42, ROOF_DARK, collection, z_offset=BUILDING_BASE_Z + height * 0.76, roughness=0.72)
    add_box_on_rect(f"{name}_roof_stack", (x + 2.58, y + 1.6, 0.34, 0.34), 0.62, FRAME_DARK, collection, z_offset=BUILDING_BASE_Z + height * 0.76, roughness=0.68)
    center_x, center_y = world_center(x + 1.98, y + 1.3)
    add_lightning_sign(f"{name}_lightning", center_x, center_y, BUILDING_BASE_Z + height * 0.76 + 0.06, collection)
    add_roof_parapet(name, base_rect, BUILDING_BASE_Z + height * 0.76, collection)


def add_campus_buildings(collection):
    """按建筑类型分发到不同原型函数，替换旧的单体盒子楼。"""
    for name, rect, height, _ in BUILDING_SPECS:
        if "building_residential" in name:
            add_residential_building(name, rect, height, collection)
        elif name == "building_resident_service":
            add_resident_service_building(name, rect, height, collection)
        elif name == "building_party_center":
            add_party_center_building(name, rect, height, collection)
        elif name == "building_property_center":
            add_property_center_building(name, rect, height, collection)
        elif name == "hub_express_main":
            add_express_hub_building(name, rect, height, collection)
        elif name == "building_sports_center":
            add_sports_center_building(name, rect, height, collection)
        elif name == "building_comprehensive":
            add_comprehensive_building(name, rect, height, collection)
        elif name == "building_power_room":
            add_power_room_building(name, rect, height, collection)


def add_road_markings(collection):
    """主干道补虚线和边线，先把地面交通语义做清楚。"""
    main_road_ids = {
        "road_vertical_west",
        "road_vertical_east",
        "road_horizontal_north",
        "road_horizontal_mid_west",
        "road_horizontal_mid_east",
        "road_horizontal_south",
    }

    edge_color = "#ecf4f8"
    center_color = "#fff4d0"

    for road_name, rect in ROAD_RECTS:
        if road_name not in main_road_ids:
            continue

        x, y, width, height = rect

        if width >= height:
            center_x, center_y = world_center(x, y + height / 2 - 0.18, width, 0.14)
            add_plane_by_size(
                name=f"{road_name}_edge_top",
                center_x=center_x,
                center_y=center_y,
                width=width * TILE_SIZE,
                height=0.14 * TILE_SIZE,
                color=edge_color,
                z_offset=MARKING_Z,
                collection=collection,
                roughness=0.4,
            )
            center_x, center_y = world_center(x, y + 0.04, width, 0.14)
            add_plane_by_size(
                name=f"{road_name}_edge_bottom",
                center_x=center_x,
                center_y=center_y,
                width=width * TILE_SIZE,
                height=0.14 * TILE_SIZE,
                color=edge_color,
                z_offset=MARKING_Z,
                collection=collection,
                roughness=0.4,
            )

            dash_y = y + height / 2 - 0.22
            dash_count = max(2, math.ceil(width / 3))
            dash_step = width / dash_count
            for index in range(dash_count):
                dash_x = x + index * dash_step + 0.35
                dash_width = min(1.2, max(0.7, dash_step - 0.45))
                center_x, center_y = world_center(dash_x, dash_y, dash_width, 0.18)
                add_plane_by_size(
                    name=f"{road_name}_dash_{index + 1}",
                    center_x=center_x,
                    center_y=center_y,
                    width=dash_width * TILE_SIZE,
                    height=0.18 * TILE_SIZE,
                    color=center_color,
                    z_offset=MARKING_Z + 0.001,
                    collection=collection,
                    roughness=0.35,
                )
        else:
            center_x, center_y = world_center(x + width / 2 - 0.18, y, 0.14, height)
            add_plane_by_size(
                name=f"{road_name}_edge_left",
                center_x=center_x,
                center_y=center_y,
                width=0.14 * TILE_SIZE,
                height=height * TILE_SIZE,
                color=edge_color,
                z_offset=MARKING_Z,
                collection=collection,
                roughness=0.4,
            )
            center_x, center_y = world_center(x + 0.04, y, 0.14, height)
            add_plane_by_size(
                name=f"{road_name}_edge_right",
                center_x=center_x,
                center_y=center_y,
                width=0.14 * TILE_SIZE,
                height=height * TILE_SIZE,
                color=edge_color,
                z_offset=MARKING_Z,
                collection=collection,
                roughness=0.4,
            )

            dash_x = x + width / 2 - 0.22
            dash_count = max(2, math.ceil(height / 3))
            dash_step = height / dash_count
            for index in range(dash_count):
                dash_y = y + index * dash_step + 0.35
                dash_height = min(1.2, max(0.7, dash_step - 0.45))
                center_x, center_y = world_center(dash_x, dash_y, 0.18, dash_height)
                add_plane_by_size(
                    name=f"{road_name}_dash_{index + 1}",
                    center_x=center_x,
                    center_y=center_y,
                    width=0.18 * TILE_SIZE,
                    height=dash_height * TILE_SIZE,
                    color=center_color,
                    z_offset=MARKING_Z + 0.001,
                    collection=collection,
                    roughness=0.35,
                )


def add_plaza_paving(collection):
    """中央广场补横纵铺装线，让活动中心更像精致小区广场。"""
    plaza_rect = next(rect for name, rect, _ in OPEN_SPACE_SPECS if name == "space_pedestrian_plaza")
    x, y, width, height = plaza_rect
    center_x, center_y = world_center(x + 0.55, y + 0.55, width - 1.1, height - 1.1)
    add_plane_by_size(
        name="plaza_inset",
        center_x=center_x,
        center_y=center_y,
        width=(width - 1.1) * TILE_SIZE,
        height=(height - 1.1) * TILE_SIZE,
        color=PLAZA_INSET,
        z_offset=OPEN_SPACE_Z + 0.001,
        collection=collection,
        roughness=0.78,
    )

    for index in range(1, width):
        center_x, center_y = world_center(x + index - 0.05, y, 0.1, height)
        add_plane_by_size(
            name=f"plaza_joint_vertical_{index}",
            center_x=center_x,
            center_y=center_y,
            width=0.1 * TILE_SIZE,
            height=height * TILE_SIZE,
            color="#fff6dd",
            z_offset=MARKING_Z,
            collection=collection,
            roughness=0.36,
        )

    for index in range(1, height):
        center_x, center_y = world_center(x, y + index - 0.05, width, 0.1)
        add_plane_by_size(
            name=f"plaza_joint_horizontal_{index}",
            center_x=center_x,
            center_y=center_y,
            width=width * TILE_SIZE,
            height=0.1 * TILE_SIZE,
            color="#fff6dd",
            z_offset=MARKING_Z,
            collection=collection,
            roughness=0.36,
        )

    add_rect_curbs("space_pedestrian_plaza", plaza_rect, collection, curb_width=0.14, curb_height=0.09, color="#c9c5bc")


def add_logistics_markings(collection):
    """给快递装卸区补黄色导流线，让物流区更像真实作业地面。"""
    apron_rect = next(rect for name, rect, _ in OPEN_SPACE_SPECS if name == "space_logistics_apron")
    x, y, width, height = apron_rect

    for index in range(height):
        center_x, center_y = world_center(x, y + index + 0.1, width, 0.12)
        add_plane_by_size(
            name=f"logistics_marking_{index + 1}",
            center_x=center_x,
            center_y=center_y,
            width=width * TILE_SIZE,
            height=0.12 * TILE_SIZE,
            color="#ffd36b",
            z_offset=MARKING_Z,
            collection=collection,
            roughness=0.3,
        )


def add_logistics_hatch(collection):
    """快递作业区补斜向黄线，做出真实装卸区的警示感。"""
    base_x, base_y, width, height = next(
        rect for name, rect, _ in OPEN_SPACE_SPECS if name == "space_logistics_apron"
    )
    for index in range(6):
        center_x, center_y = world_center(
            base_x - 0.2 + index * 0.38,
            base_y + 0.45 + index * (height / 8),
            0.16,
            min(1.2, height / 4),
        )
        plane = add_plane_by_size(
            name=f"logistics_hatch_{index + 1}",
            center_x=center_x,
            center_y=center_y,
            width=0.16 * TILE_SIZE,
            height=min(1.2, height / 4) * TILE_SIZE,
            color="#ffd25f",
            z_offset=MARKING_Z + 0.001,
            collection=collection,
            roughness=0.3,
        )
        plane.rotation_euler[2] = math.radians(35)


def add_grass_variation(collection):
    """在草地上补几块浅深变化，避免整个园区只有一整片死绿。"""
    accents = [
        ("grass_accent_north_1", (22.8, 4.6, 3.4, 1.6), GRASS_LIGHT),
        ("grass_accent_north_2", (27.2, 7.1, 2.8, 1.2), GRASS_DEEP),
        ("grass_accent_central", (33.0, 18.0, 1.4, 3.6), GRASS_MOSS),
        ("grass_accent_south_1", (22.6, 27.3, 2.8, 1.1), GRASS_LIGHT),
        ("grass_accent_south_2", (27.4, 29.0, 3.0, 0.9), GRASS_DEEP),
        ("grass_accent_residential", (7.6, 18.2, 1.3, 10.6), GRASS_MOSS),
    ]

    for name, (x, y, width, height), color in accents:
        center_x, center_y = world_center(x, y, width, height)
        add_plane_by_size(
            name=name,
            center_x=center_x,
            center_y=center_y,
            width=width * TILE_SIZE,
            height=height * TILE_SIZE,
            color=color,
            z_offset=OPEN_SPACE_Z + 0.0005,
            collection=collection,
            roughness=0.95,
        )


def add_crosswalks(collection):
    """出入口和广场连接处补斑马线，让道路语言更接近真实小区。"""
    crosswalks = [
        ("crosswalk_north", (17.2, 9.6, "horizontal")),
        ("crosswalk_south", (35.4, 32.7, "horizontal")),
    ]

    for name, (x, y, direction) in crosswalks:
        for index in range(5):
            width = 0.4 if direction == "horizontal" else 1.8
            height = 1.8 if direction == "horizontal" else 0.4
            offset_x = x + index * 0.55 if direction == "horizontal" else x
            offset_y = y if direction == "horizontal" else y + index * 0.55
            center_x, center_y = world_center(offset_x, offset_y, width, height)
            add_plane_by_size(
                name=f"{name}_{index + 1}",
                center_x=center_x,
                center_y=center_y,
                width=width * TILE_SIZE,
                height=height * TILE_SIZE,
                color="#f7f7f1",
                z_offset=MARKING_Z + 0.001,
                collection=collection,
                roughness=0.32,
            )


def add_ground(collection):
    """创建整个园区地面底板。"""
    bpy.ops.mesh.primitive_plane_add(location=(0, 0, GROUND_Z))
    ground = bpy.context.active_object
    ground.name = "ground_base"
    ground.scale = (GRID_COLS * TILE_SIZE / 2, GRID_ROWS * TILE_SIZE / 2, 1)
    ground.data.materials.append(make_material("mat_ground", GRASS_BASE, roughness=0.97))
    link_object(ground, collection)


def add_border(collection):
    """补一圈低矮边界，避免画面边缘显得太空。"""
    border_color = "#d7dde6"
    thickness = 0.18
    segments = [
        ("border_north", (GRID_COLS / 2 - 0.5, -0.5, GRID_COLS, 1)),
        ("border_south", (GRID_COLS / 2 - 0.5, GRID_ROWS - 0.5, GRID_COLS, 1)),
        ("border_west", (-0.5, GRID_ROWS / 2 - 0.5, 1, GRID_ROWS)),
        ("border_east", (GRID_COLS - 0.5, GRID_ROWS / 2 - 0.5, 1, GRID_ROWS)),
    ]

    for name, (center_grid_x, center_grid_y, width, depth) in segments:
        world_x = (center_grid_x - (GRID_COLS - 1) / 2) * TILE_SIZE
        world_y = (center_grid_y - (GRID_ROWS - 1) / 2) * TILE_SIZE
        bpy.ops.mesh.primitive_cube_add(location=(world_x, world_y, 0.12))
        border = bpy.context.active_object
        border.name = name
        border.scale = (width * TILE_SIZE / 2, depth * TILE_SIZE / 2, thickness / 2)
        border.data.materials.append(make_material("mat_border", border_color, roughness=0.9))
        link_object(border, collection)


def generate_scene():
    """按业务地图批量创建道路、建筑、开放空间和业务标记。"""
    clear_scene()

    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.world.color = (0.92, 0.97, 1.0)

    collection_ground = ensure_collection("Ground")
    collection_roads = ensure_collection("Roads")
    collection_buildings = ensure_collection("Buildings")
    collection_landscape = ensure_collection("Landscape")
    collection_markers = ensure_collection("Markers")

    add_ground(collection_ground)
    add_border(collection_ground)

    for name, rect in ROAD_RECTS:
        road_color = ROAD_ASPHALT if "road_horizontal" in name or "road_vertical" in name else ROAD_SERVICE
        add_plane(name, rect, road_color, ROAD_Z, collection_roads)

    for name, rect, color in OPEN_SPACE_SPECS:
        if name == "space_pedestrian_plaza":
            zone_color = PLAZA_BASE
        elif name == "space_dispatch_parking":
            zone_color = PARKING_SURFACE
        elif name == "space_logistics_apron":
            zone_color = LOGISTICS_SURFACE
        elif "landscape" in name:
            zone_color = GRASS_LIGHT if "north" in name else GRASS_DEEP if "greenbelt" in name else GRASS_BASE
        else:
            zone_color = color

        add_plane(name, rect, zone_color, OPEN_SPACE_Z, collection_landscape)

    add_building_aprons(collection_landscape)
    add_residential_garden_bands(collection_landscape)
    add_residential_entry_paths(collection_landscape)
    add_public_entry_paths(collection_landscape)
    add_grass_variation(collection_landscape)
    add_road_markings(collection_roads)
    add_crosswalks(collection_roads)
    add_plaza_paving(collection_landscape)
    add_logistics_markings(collection_landscape)
    add_logistics_hatch(collection_landscape)
    add_parking_lines(collection_landscape)

    add_campus_buildings(collection_buildings)

    for name, point, color in SERVICE_MARKERS:
        add_marker(name, point, color, collection_markers)

    add_gate_booth("gate_north", (19, 1), collection_markers)
    add_gate_booth("gate_south", (37, 43), collection_markers)


def export_scene():
    """保存 .blend 并导出 .glb，给前端直接加载。"""
    OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=True,
    )


generate_scene()
export_scene()
print(f"已导出 {OUTPUT_BLEND}")
print(f"已导出 {OUTPUT_GLB}")
