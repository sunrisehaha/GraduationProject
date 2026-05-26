"""生成园区静态 Blender 场景。"""

import math
import random
import re
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_MODEL_DIR = PROJECT_ROOT / "assets" / "models"
CAMPUS_SOURCE_DIR = PROJECT_ROOT / "assets" / "campus"
PUBLIC_SCENE_DIR = PROJECT_ROOT / "frontend" / "public" / "scene"
SCENE_DIR = SOURCE_MODEL_DIR
OUTPUT_BLEND = CAMPUS_SOURCE_DIR / "campus.blend"
OUTPUT_GLB = PUBLIC_SCENE_DIR / "campus.glb"
OUTPUT_PREVIEW = CAMPUS_SOURCE_DIR / "campus_preview.png"

# 场景微调阶段只保存 .blend，等布局确认后再导出前端资源。
EXPORT_GLB = False
RENDER_PREVIEW = False

# Draco 压缩用于降低前端首屏加载体积；前端 GLTFLoader 已配置 /scene/draco/ 解码器。
GLB_DRACO_EXPORT_OPTIONS = {
    "export_draco_mesh_compression_enable": True,
    "export_draco_mesh_compression_level": 6,
    "export_draco_position_quantization": 14,
    "export_draco_normal_quantization": 10,
    "export_draco_texcoord_quantization": 12,
    "export_draco_color_quantization": 10,
    "export_draco_generic_quantization": 12,
}

ASSET_SPECS = {
    "boundary_tree": {
        "path": SCENE_DIR / "environment" / "trees" / "tree.glb",
    },
    "grass": {
        "path": SCENE_DIR / "environment" / "ground" / "grass.glb",
    },
    "minecraft_park": {"path": SCENE_DIR / "environment" / "parks" / "minecraft_park.glb"},
    "office_tower": {"path": SCENE_DIR / "buildings" / "public" / "office_tower.glb"},
    "library": {"path": SCENE_DIR / "buildings" / "public" / "library.glb"},
    "property_center": {"path": SCENE_DIR / "buildings" / "public" / "property_center.glb"},
    "logistics_center": {
        "path": SCENE_DIR / "buildings" / "public" / "logistics_center.glb",
        "exclude_contains": {"UCX_", "ConcreteSidewalk", "M_DefaultGray"},
    },
    "apartment": {"path": SCENE_DIR / "buildings" / "residential" / "apartment.glb"},
    "villa": {"path": SCENE_DIR / "buildings" / "residential" / "house.glb"},
    "booking_lot_restaurant": {"path": SCENE_DIR / "buildings" / "food" / "booking_lot_restaurant.glb"},
    "japanese_vendor": {"path": SCENE_DIR / "buildings" / "food" / "japanese_vendor.glb"},
    "japanese_cuisine": {"path": SCENE_DIR / "buildings" / "food" / "japanese_cuisine.glb"},
    "japanese_ramen": {"path": SCENE_DIR / "buildings" / "food" / "japanese_ramen.glb"},
    "korean_bakery": {"path": SCENE_DIR / "buildings" / "food" / "korean_bakery.glb", "ground_z": 0.0},
    "paris_restaurant": {"path": SCENE_DIR / "buildings" / "food" / "paris_restaurant.glb"},
    "samhui_restaurant": {"path": SCENE_DIR / "buildings" / "food" / "samhui_restaurant.glb"},
}

ASSET_TEMPLATES = {}
ASSET_TEMPLATE_OBJECTS = []
MATERIAL_CACHE = {}

GRID_COLS = 100
GRID_ROWS = 90
TILE_SIZE = 0.6
SOUTH_FACING_ROTATION = 0
HOUSE_CLOCKWISE_ROTATION = SOUTH_FACING_ROTATION - 90
BOOKING_LOT_RESTAURANT_RECT = (47.8, 73.0, 18.6, 12.0)
BOOKING_LOT_RESTAURANT_PLAZA_RECT = (35.8, 72.0, 31.8, 13.8)
BOOKING_LOT_RESTAURANT_MARKER_POINT = (48.4, 82.4)
CENTRAL_PARK_RECT = (40.0, 33.0, 25.0, 22.0)

# 稳定 ID 后续接世界规则和手动派件；展示名用于 Blender 标签和业务界面。
WEST_BUILDING_DEFS = [
    {"id": "west_office", "name": "写字楼", "label": "写字楼", "asset": "office_tower", "rect": (3.625, 5.125, 32.25, 23.25), "height": 11.1},
    {"id": "west_library", "name": "图书馆", "label": "图书馆", "asset": "library", "rect": (3.75, 28.05, 31.5, 17.7), "height": 9.6},
    {"id": "west_property_center", "name": "物业中心", "label": "物业中心", "asset": "property_center", "rect": (6.8, 49.65, 25.2, 14.1), "height": 6.15, "fit": 0.82},
    {"id": "west_logistics_center", "name": "物流中心", "label": "物流中心", "asset": "logistics_center", "rect": (3.75, 65.85, 31.5, 12.9), "height": 8.7},
]

FOOD_BUILDING_DEFS = [
    {"id": "food_japanese_cuisine", "name": "日本料理", "label": "日本料理", "asset": "japanese_cuisine", "rect": (40.2, 8.4, 10.2, 9.4), "height": 3.9, "fit": 0.94},
    {"id": "food_paris_restaurant", "name": "巴黎餐厅", "label": "巴黎餐厅", "asset": "paris_restaurant", "rect": (55.7, 8.4, 10.2, 9.4), "height": 3.7, "fit": 0.94},
    {"id": "food_japanese_ramen", "name": "日本拉面", "label": "日本拉面", "asset": "japanese_ramen", "rect": (41.4, 21.4, 7.8, 7.3), "height": 2.75, "rotation": SOUTH_FACING_ROTATION - 90, "fit": 0.86},
    {"id": "food_samhui_restaurant", "name": "韩国三熙饭店", "label": "三熙饭店", "asset": "samhui_restaurant", "rect": (56.9, 21.4, 7.8, 7.3), "height": 2.65, "fit": 0.86},
    {"id": "food_japanese_vendor", "name": "日本小商贩", "label": "日本小商贩", "asset": "japanese_vendor", "rect": (39.2, 59.4, 11.0, 8.0), "height": 4.575, "fit": 0.96},
    {"id": "food_korean_bakery", "name": "韩国糕点店", "label": "韩国糕点店", "asset": "korean_bakery", "rect": (55.2, 59.4, 11.0, 8.0), "height": 6.035, "fit": 0.98},
    {"id": "food_booking_lot_restaurant", "name": "订车场饭店", "label": "订车场饭店", "asset": "booking_lot_restaurant", "rect": BOOKING_LOT_RESTAURANT_RECT, "height": 5.2, "fit": 0.98},
]

APARTMENT_DEFS = [
    {"id": "apt_a1", "name": "东区公寓 A1", "label": "A1", "rect": (69.0, 11.5, 9.2, 6.3)},
    {"id": "apt_a2", "name": "东区公寓 A2", "label": "A2", "rect": (85.0, 11.5, 9.2, 6.3)},
    {"id": "apt_a3", "name": "东区公寓 A3", "label": "A3", "rect": (69.0, 28.0, 9.2, 6.3)},
    {"id": "apt_a4", "name": "东区公寓 A4", "label": "A4", "rect": (85.0, 28.0, 9.2, 6.3)},
]

VILLA_DEFS = [
    {"id": "villa_b1", "name": "东区别墅 B1", "label": "B1", "rect": (69.3, 43.0, 6.9, 5.6)},
    {"id": "villa_b2", "name": "东区别墅 B2", "label": "B2", "rect": (78.4, 43.0, 6.9, 5.6)},
    {"id": "villa_b3", "name": "东区别墅 B3", "label": "B3", "rect": (86.7, 43.0, 6.9, 5.6)},
    {"id": "villa_b4", "name": "东区别墅 B4", "label": "B4", "rect": (69.3, 59.7, 6.9, 5.6)},
    {"id": "villa_b5", "name": "东区别墅 B5", "label": "B5", "rect": (78.4, 59.7, 6.9, 5.6)},
    {"id": "villa_b6", "name": "东区别墅 B6", "label": "B6", "rect": (86.7, 59.7, 6.9, 5.6)},
    {"id": "villa_b7", "name": "东区别墅 B7", "label": "B7", "rect": (69.3, 75.0, 6.9, 5.6)},
    {"id": "villa_b8", "name": "东区别墅 B8", "label": "B8", "rect": (78.4, 75.0, 6.9, 5.6)},
    {"id": "villa_b9", "name": "东区别墅 B9", "label": "B9", "rect": (86.7, 75.0, 6.9, 5.6)},
]

GROUND_Z = 0.0
GRASS_Z = 0.012
ROAD_Z = 0.04
MARKING_Z = 0.056
BUILDING_Z = 0.06
SIDEWALK_Z = ROAD_Z - 0.018
SURFACE_FLOOR_Z = ROAD_Z - 0.01

FONT_CANDIDATES = [
    Path("/System/Library/Fonts/STHeiti Light.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
]

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


def hex_to_rgba(hex_color, alpha=1.0):
    """把十六进制颜色转成 Blender 材质颜色。"""
    color = hex_color.lstrip("#")
    return (
        int(color[0:2], 16) / 255,
        int(color[2:4], 16) / 255,
        int(color[4:6], 16) / 255,
        alpha,
    )


def clear_scene():
    """清空默认场景，保证每次生成都是干净结果。"""
    MATERIAL_CACHE.clear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for datablocks in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.collections,
        bpy.data.fonts,
    ):
        for block in list(datablocks):
            if getattr(block, "users", 0) == 0:
                datablocks.remove(block)


def ensure_collection(name):
    """按业务图层分组，方便后续在 Blender 里继续微调。"""
    collection = bpy.data.collections.get(name)
    if collection:
        return collection

    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_object(obj, collection):
    """把对象移入指定 collection，避免所有对象堆在根层级。"""
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def make_material(name, hex_color, roughness=0.72, metallic=0.0, alpha=1.0, emission=None):
    """统一创建 PBR 材质，导出 GLB 后颜色更稳定。"""
    emission_key = None
    if emission:
        emission_key = (emission[0].lower(), round(float(emission[1]), 4))
    material_key = (
        hex_color.lower(),
        round(float(roughness), 4),
        round(float(metallic), 4),
        round(float(alpha), 4),
        emission_key,
    )
    cached_material = MATERIAL_CACHE.get(material_key)
    if cached_material and bpy.data.materials.get(cached_material.name) == cached_material:
        return cached_material

    material = bpy.data.materials.get(name)
    if material:
        MATERIAL_CACHE[material_key] = material
        return material

    material = bpy.data.materials.new(name)
    MATERIAL_CACHE[material_key] = material
    material.use_nodes = True
    material.diffuse_color = hex_to_rgba(hex_color, alpha)
    if alpha < 1:
        material.blend_method = "BLEND"
        material.use_screen_refraction = True

    principled = next(
        (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )
    if principled:
        if "Base Color" in principled.inputs:
            principled.inputs["Base Color"].default_value = hex_to_rgba(hex_color, alpha)
        if "Alpha" in principled.inputs:
            principled.inputs["Alpha"].default_value = alpha
        if "Roughness" in principled.inputs:
            principled.inputs["Roughness"].default_value = roughness
        if "Metallic" in principled.inputs:
            principled.inputs["Metallic"].default_value = metallic
        if emission and "Emission Color" in principled.inputs:
            principled.inputs["Emission Color"].default_value = hex_to_rgba(emission[0], 1.0)
        if emission and "Emission Strength" in principled.inputs:
            principled.inputs["Emission Strength"].default_value = emission[1]

    return material


def is_mergeable_static_plane(obj):
    """只合并静态单面平面，保留复杂模型和动态对象的独立结构。"""
    return (
        obj.type == "MESH"
        and len(obj.data.vertices) == 4
        and len(obj.data.polygons) == 1
        and len(obj.data.materials) == 1
        and not obj.modifiers
        and not obj.animation_data
    )


def sanitize_object_name(name):
    """把 collection 和材质名压成 Blender/GLB 里稳定可读的对象名。"""
    return re.sub(r"[^0-9A-Za-z_]+", "_", name).strip("_").lower() or "scene"


def merge_static_plane_meshes():
    """减少静态平面对象数量，直接降低前端每帧 draw call 压力。"""
    groups = {}
    for obj in bpy.data.objects:
        if not is_mergeable_static_plane(obj):
            continue

        material = obj.data.materials[0]
        collection_name = obj.users_collection[0].name if obj.users_collection else "Scene"
        groups.setdefault((collection_name, material.name), []).append(obj)

    merged_objects = 0
    removed_objects = 0
    for (collection_name, material_name), objects in sorted(groups.items()):
        if len(objects) < 2:
            continue

        bpy.ops.object.select_all(action="DESELECT")
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        for obj in objects:
            obj.select_set(True)
        bpy.ops.object.join()

        merged = bpy.context.active_object
        base_name = sanitize_object_name(f"merged_{collection_name}_{material_name}")[:58]
        merged.name = base_name
        merged.data.name = base_name
        merged_objects += 1
        removed_objects += len(objects) - 1

    print(f"已合并静态平面：{removed_objects} 个对象 -> {merged_objects} 个对象")


def replace_object_materials(obj, material):
    """把单个导入模型的材质槽替换掉，解决外部 GLB 材质过暗的问题。"""
    if not hasattr(obj.data, "materials"):
        return

    if obj.data.materials:
        for index in range(len(obj.data.materials)):
            obj.data.materials[index] = material
    else:
        obj.data.materials.append(material)


def apply_office_tower_materials(obj):
    """写字楼原模型黑色石材太重，这里单独提亮，保留窗户和楼层细节。"""
    object_name = obj.name.lower()
    material_names = " ".join(
        slot.material.name.lower()
        for slot in getattr(obj, "material_slots", [])
        if slot.material
    )
    text = f"{object_name} {material_names}"

    if "glass" in text or "window" in text:
        material = make_material("mat_office_tower_glass_clear", "#7f9caf", roughness=0.36, alpha=0.9)
    elif "light" in text:
        material = make_material("mat_office_tower_warm_light", "#f6d37a", roughness=0.34, emission=("#f6d37a", 0.45))
    elif "blackstone" in text or "layer" in text:
        material = make_material("mat_office_tower_soft_stone", "#72818e", roughness=0.62)
    elif "iron" in text or "vent" in text:
        material = make_material("mat_office_tower_metal", "#566779", roughness=0.48, metallic=0.1)
    else:
        material = make_material("mat_office_tower_light_wall", "#b7c1ca", roughness=0.7)

    replace_object_materials(obj, material)


def get_mesh_bounds(objects):
    """计算一组网格对象的世界包围盒。"""
    mesh_objects = [obj for obj in objects if obj.type == "MESH" and hasattr(obj, "bound_box")]
    if not mesh_objects:
        return None

    min_corner = Vector((math.inf, math.inf, math.inf))
    max_corner = Vector((-math.inf, -math.inf, -math.inf))
    for obj in mesh_objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            min_corner.x = min(min_corner.x, point.x)
            min_corner.y = min(min_corner.y, point.y)
            min_corner.z = min(min_corner.z, point.z)
            max_corner.x = max(max_corner.x, point.x)
            max_corner.y = max(max_corner.y, point.y)
            max_corner.z = max(max_corner.z, point.z)

    return min_corner, max_corner


def import_asset_template(asset_key):
    """导入一次 GLB 模板，后续用共享网格实例化，避免重复导入。"""
    if asset_key in ASSET_TEMPLATES:
        return ASSET_TEMPLATES[asset_key]

    spec = ASSET_SPECS.get(asset_key)
    if not spec or not spec["path"].exists():
        return None

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(spec["path"]))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    selected = [obj for obj in imported if obj.type == "MESH"]
    if spec.get("names"):
        selected = [obj for obj in selected if obj.name in spec["names"]]
    if spec.get("exclude_contains"):
        exclude_tokens = tuple(token.lower() for token in spec["exclude_contains"])
        selected = [
            obj
            for obj in selected
            if not any(token in obj.name.lower() for token in exclude_tokens)
        ]

    bounds = get_mesh_bounds(selected)
    if bounds is None:
        return None

    ASSET_TEMPLATE_OBJECTS.extend(imported)
    for obj in imported:
        obj.hide_viewport = True
        obj.hide_render = True

    min_corner, max_corner = bounds
    template = {
        "objects": selected,
        "min": min_corner,
        "max": max_corner,
        "center": (min_corner + max_corner) * 0.5,
        "size": max_corner - min_corner,
        "ground_z": spec.get("ground_z", min_corner.z),
    }
    ASSET_TEMPLATES[asset_key] = template
    return template


def add_asset_instance(
    asset_key,
    name,
    point,
    collection,
    target_size=None,
    target_height=None,
    z=0.0,
    rotation_z=0.0,
):
    """把真实 GLB 资源按目标点实例化到场景里。"""
    template = import_asset_template(asset_key)
    if not template:
        return False

    size = template["size"]
    if target_height:
        scale = target_height / max(size.z, 0.001)
    else:
        scale = (target_size or 1.0) / max(size.x, size.y, size.z, 0.001)

    center_x, center_y = world_center(point[0], point[1])
    transform = (
        Matrix.Translation(Vector((center_x, center_y, z)))
        @ Matrix.Rotation(rotation_z, 4, "Z")
        @ Matrix.Diagonal((scale, scale, scale, 1))
        @ Matrix.Translation(Vector((-template["center"].x, -template["center"].y, -template["min"].z)))
    )

    for obj in template["objects"]:
        clone = obj.copy()
        clone.data = obj.data
        clone.parent = None
        clone.matrix_parent_inverse.identity()
        clone.animation_data_clear()
        clone.name = f"{name}_{obj.name}"
        clone.matrix_world = transform @ obj.matrix_world
        clone.hide_viewport = False
        clone.hide_render = False
        if asset_key == "office_tower":
            apply_office_tower_materials(clone)
        link_object(clone, collection)

    return True


def add_glb_building(
    asset_key,
    name,
    rect,
    collection,
    max_height=None,
    rotation_z=0.0,
    fit=0.86,
    base_color=None,
    z_offset=0.0,
):
    """把真实建筑 GLB 统一缩放进指定地块，保证住宅和商铺比例一致。"""
    template = import_asset_template(asset_key)
    if not template:
        return False

    x, y, width, depth = rect
    size = template["size"]
    if min(size.x, size.y, size.z) <= 0:
        return False

    angle = math.radians(rotation_z)
    rotated_width = abs(size.x * math.cos(angle)) + abs(size.y * math.sin(angle))
    rotated_depth = abs(size.x * math.sin(angle)) + abs(size.y * math.cos(angle))
    target_width = width * TILE_SIZE * fit
    target_depth = depth * TILE_SIZE * fit
    scale = min(target_width / rotated_width, target_depth / rotated_depth)
    if max_height:
        scale = min(scale, max_height / size.z)

    if scale <= 0:
        return False

    if base_color:
        add_box_grid(
            f"{name}_base",
            rect,
            0.08,
            base_color,
            collection,
            z=0.025,
            roughness=0.78,
            bevel=0.035,
        )

    center_x, center_y = world_center(x, y, width, depth)
    transform = (
        Matrix.Translation(Vector((center_x, center_y, BUILDING_Z + z_offset)))
        @ Matrix.Rotation(angle, 4, "Z")
        @ Matrix.Diagonal((scale, scale, scale, 1))
        @ Matrix.Translation(
            Vector((-template["center"].x, -template["center"].y, -template["ground_z"]))
        )
    )

    for obj in template["objects"]:
        clone = obj.copy()
        clone.data = obj.data
        clone.parent = None
        clone.matrix_parent_inverse.identity()
        clone.animation_data_clear()
        clone.name = f"{name}_{obj.name}"
        clone.matrix_world = transform @ obj.matrix_world
        clone.hide_viewport = False
        clone.hide_render = False
        if asset_key == "office_tower":
            apply_office_tower_materials(clone)
        link_object(clone, collection)

    return True


def cleanup_asset_templates():
    """删除隐藏模板对象，只保留实际实例，避免导出多余资源。"""
    for obj in list(ASSET_TEMPLATE_OBJECTS):
        try:
            existing = bpy.data.objects.get(obj.name)
        except ReferenceError:
            continue

        if existing:
            bpy.data.objects.remove(existing, do_unlink=True)
    ASSET_TEMPLATE_OBJECTS.clear()


def load_cjk_font():
    """优先使用系统中文字体，让场景里的中文标签能转成网格。"""
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            return bpy.data.fonts.load(str(candidate))
    return None


def svg_rect(x, y, width, height):
    """SVG 主图里 12 像素代表 1 个网格。"""
    return (x / 12, y / 12, width / 12, height / 12)


def svg_point(x, y):
    """把 SVG 坐标换成网格点坐标。"""
    return (x / 12, y / 12)


def world_center(x, y, width=1, height=1):
    """把业务网格转成 Blender 平面坐标；SVG y 轴向下，所以这里翻转。"""
    return (
        (x + width / 2 - GRID_COLS / 2) * TILE_SIZE,
        -(y + height / 2 - GRID_ROWS / 2) * TILE_SIZE,
    )


def add_plane_grid(name, rect, color, z, collection, roughness=0.82, alpha=1.0):
    """按网格矩形创建平面，用于草地、道路、标线和铺装。"""
    x, y, width, height = rect
    center_x, center_y = world_center(x, y, width, height)
    bpy.ops.mesh.primitive_plane_add(location=(center_x, center_y, z))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width * TILE_SIZE / 2, height * TILE_SIZE / 2, 1)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness, alpha=alpha))
    return link_object(obj, collection)


def add_tile_grid(name, rect, collection, z, step=1.8, color="#c9d4dc", line_width=0.035, alpha=0.55):
    """给铺装面加浅色砖缝，让地面不是单块平板。"""
    x, y, width, height = rect
    vertical_count = max(0, int(width / step))
    horizontal_count = max(0, int(height / step))

    for index in range(1, vertical_count):
        line_x = x + index * step
        add_plane_grid(
            f"{name}_tile_v_{index:02d}",
            (line_x - line_width / 2, y, line_width, height),
            color,
            z,
            collection,
            roughness=0.78,
            alpha=alpha,
        )

    for index in range(1, horizontal_count):
        line_y = y + index * step
        add_plane_grid(
            f"{name}_tile_h_{index:02d}",
            (x, line_y - line_width / 2, width, line_width),
            color,
            z,
            collection,
            roughness=0.78,
            alpha=alpha,
        )


def add_random_surface_strokes(
    name,
    rect,
    collection,
    z,
    colors,
    count,
    min_length,
    max_length,
    min_width=0.025,
    max_width=0.055,
):
    """用少量随机细线表达草屑或石纹，避免材质靠纯色硬撑。"""
    x, y, width, height = rect
    rng = random.Random(name)

    for index in range(count):
        length = rng.uniform(min_length, max_length)
        stroke_width = rng.uniform(min_width, max_width)
        stroke_x = rng.uniform(x + 0.35, x + max(0.36, width - 0.35))
        stroke_y = rng.uniform(y + 0.35, y + max(0.36, height - 0.35))
        obj = add_plane_grid(
            f"{name}_stroke_{index + 1:02d}",
            (stroke_x, stroke_y, length, stroke_width),
            rng.choice(colors),
            z,
            collection,
            roughness=0.84,
            alpha=rng.uniform(0.35, 0.68),
        )
        obj.rotation_euler[2] = math.radians(rng.uniform(-34, 34))


def expand_rect(rect, padding):
    """给建筑铺装留出一圈可见边界。"""
    x, y, width, height = rect
    return (x - padding, y - padding, width + padding * 2, height + padding * 2)


def add_marble_floor(name, rect, collection, padding=0.65):
    """用浅色大理石感地板承托公共建筑和餐厅。"""
    floor_rect = expand_rect(rect, padding)
    add_plane_grid(name, floor_rect, "#f1f4f4", SURFACE_FLOOR_Z, collection, roughness=0.42)

    x, y, width, height = floor_rect
    add_tile_grid(
        f"{name}_tile",
        floor_rect,
        collection,
        SURFACE_FLOOR_Z + 0.003,
        step=1.45,
        color="#d5dde3",
        line_width=0.028,
        alpha=0.5,
    )
    vein_count = max(8, min(24, int(width * height / 10)))
    add_random_surface_strokes(
        f"{name}_vein",
        floor_rect,
        collection,
        SURFACE_FLOOR_Z + 0.005,
        ["#9db0be", "#b8c4cb", "#d8dee2"],
        vein_count,
        min_length=0.8,
        max_length=2.7,
        min_width=0.018,
        max_width=0.035,
    )


def add_grass_floor(name, rect, collection, padding=0.75):
    """用薄草地铺装表达住宅、小商铺和订车场饭店的底座。"""
    floor_rect = expand_rect(rect, padding)
    add_plane_grid(name, floor_rect, "#aee1a1", SURFACE_FLOOR_Z - 0.002, collection, roughness=0.92)

    x, y, width, height = floor_rect
    detail_count = max(18, min(110, int(width * height / 18)))
    add_random_surface_strokes(
        f"{name}_grass_detail",
        floor_rect,
        collection,
        SURFACE_FLOOR_Z + 0.002,
        ["#6eaf68", "#8bc985", "#d7f1ba"],
        detail_count,
        min_length=0.12,
        max_length=0.42,
        min_width=0.018,
        max_width=0.04,
    )


def add_box_grid(
    name,
    rect,
    height,
    color,
    collection,
    z=BUILDING_Z,
    roughness=0.72,
    bevel=0.0,
    alpha=1.0,
):
    """按网格矩形创建低模体块。"""
    x, y, width, depth = rect
    center_x, center_y = world_center(x, y, width, depth)
    bpy.ops.mesh.primitive_cube_add(location=(center_x, center_y, z + height / 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width * TILE_SIZE / 2, depth * TILE_SIZE / 2, height / 2)
    obj.data.materials.append(
        make_material(f"mat_{name}", color, roughness=roughness, alpha=alpha)
    )
    if bevel > 0:
        modifier = obj.modifiers.new("soft_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return link_object(obj, collection)


def add_box_on_rect(
    name,
    rect,
    height,
    color,
    collection,
    z_offset=BUILDING_Z,
    roughness=0.76,
    bevel_width=0.04,
):
    """旧 60 x 45 场景的建筑细节都按网格矩形拼装，这里统一适配到新底座。"""
    return add_box_grid(
        name,
        rect,
        height,
        color,
        collection,
        z=z_offset,
        roughness=roughness,
        bevel=bevel_width,
    )


def add_cylinder_grid(
    name,
    rect,
    height,
    color,
    collection,
    z=BUILDING_Z,
    vertices=28,
    roughness=0.76,
    bevel=0.03,
):
    """在网格矩形里创建圆形或椭圆体块，用于公共建筑主楼。"""
    x, y, width, depth = rect
    center_x, center_y = world_center(x, y, width, depth)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=1,
        depth=height,
        location=(center_x, center_y, z + height / 2),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width * TILE_SIZE / 2, depth * TILE_SIZE / 2, 1)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness))
    if bevel > 0:
        modifier = obj.modifiers.new("soft_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return link_object(obj, collection)


def add_box_world(
    name,
    center_x,
    center_y,
    width,
    depth,
    height,
    color,
    collection,
    z=BUILDING_Z,
    roughness=0.72,
    bevel=0.0,
):
    """按世界坐标创建体块，适合做栏杆、长椅和路缘石。"""
    bpy.ops.mesh.primitive_cube_add(location=(center_x, center_y, z + height / 2))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width / 2, depth / 2, height / 2)
    obj.data.materials.append(make_material(f"mat_{name}", color, roughness=roughness))
    if bevel > 0:
        modifier = obj.modifiers.new("soft_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return link_object(obj, collection)


def add_cylinder_world(
    name,
    center_x,
    center_y,
    radius,
    depth,
    color,
    collection,
    z=BUILDING_Z,
    vertices=24,
    roughness=0.72,
    emission=None,
):
    """创建圆柱体，用于树干、灯柱、标记点和水池边界。"""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=(center_x, center_y, z + depth / 2),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(
        make_material(f"mat_{name}", color, roughness=roughness, emission=emission)
    )
    return link_object(obj, collection)


def add_text_label(name, text, point, z, collection, size=0.44, color="#1f2937"):
    """生成平铺中文标签，主要用于静态场景里快速识别区域。"""
    x, y = world_center(point[0], point[1])
    bpy.ops.object.text_add(location=(x, y, z), rotation=(0, 0, math.pi))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.018
    obj.data.bevel_depth = 0.002
    font = load_cjk_font()
    if font:
        obj.data.font = font

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    mesh_obj = bpy.context.active_object
    mesh_obj.name = name
    mesh_obj.data.materials.append(make_material(f"mat_{name}", color, roughness=0.5))
    return link_object(mesh_obj, collection)


def add_roof_parapet(name, rect, roof_z, collection, color=ROOF_DARK):
    """给屋顶加一圈女儿墙，避免建筑只像简单盒子。"""
    x, y, width, depth = rect
    strip = min(0.16, width * 0.08, depth * 0.08)
    height = 0.16
    add_box_on_rect(f"{name}_parapet_north", (x, y, width, strip), height, color, collection, z_offset=roof_z, roughness=0.86, bevel_width=0.018)
    add_box_on_rect(f"{name}_parapet_south", (x, y + depth - strip, width, strip), height, color, collection, z_offset=roof_z, roughness=0.86, bevel_width=0.018)
    add_box_on_rect(f"{name}_parapet_west", (x, y, strip, depth), height, color, collection, z_offset=roof_z, roughness=0.86, bevel_width=0.018)
    add_box_on_rect(f"{name}_parapet_east", (x + width - strip, y, strip, depth), height, color, collection, z_offset=roof_z, roughness=0.86, bevel_width=0.018)


def add_window_bands(prefix, x, y, width, collection, heights, color=GLASS_BLUE):
    """用横向窗带表达立面细节，保留低模风格但增加层次。"""
    for index, (z_offset, band_height) in enumerate(heights, start=1):
        add_box_on_rect(
            f"{prefix}_window_band_{index}",
            (x, y, width, 0.1),
            band_height,
            color,
            collection,
            z_offset=z_offset,
            roughness=0.38,
            bevel_width=0.01,
        )


def add_floor_bands(prefix, x, y, width, levels, slab_depth, collection, rail_color=GLASS_LIGHT):
    """给住宅前立面补阳台板和栏杆。"""
    for index, level_z in enumerate(levels, start=1):
        add_box_on_rect(
            f"{prefix}_balcony_slab_{index}",
            (x, y, width, slab_depth),
            0.07,
            STONE_LIGHT,
            collection,
            z_offset=level_z,
            roughness=0.9,
            bevel_width=0.015,
        )
        add_box_on_rect(
            f"{prefix}_balcony_rail_{index}",
            (x + width * 0.04, y + slab_depth - 0.06, width * 0.92, 0.05),
            0.26,
            rail_color,
            collection,
            z_offset=level_z + 0.1,
            roughness=0.48,
            bevel_width=0.01,
        )


def add_roof_badge(name, rect, roof_z, collection, label_text):
    """住宅屋顶补楼栋号，沿用旧场景的可识别做法。"""
    x, y, width, depth = rect
    badge_width = min(max(width * 0.42, 1.2), 2.2)
    badge_rect = (x + width / 2 - badge_width / 2, y + depth * 0.72, badge_width, 0.42)
    add_box_on_rect(
        f"{name}_badge_base",
        badge_rect,
        0.12,
        FRAME_DEEP,
        collection,
        z_offset=roof_z + 0.08,
        roughness=0.78,
        bevel_width=0.02,
    )
    add_text_label(
        f"{name}_badge_text",
        label_text,
        (x + width / 2, y + depth * 0.92),
        roof_z + 0.2,
        collection,
        size=0.26,
        color="#fff7e1",
    )


def add_road(name, rect, collection, color="#b9c7d6", has_lane=True):
    """创建道路主体和中心虚线。"""
    x, y, width, height = rect
    add_plane_grid(name, rect, color, ROAD_Z, collection, roughness=0.88)

    edge_color = "#c8d1d7"
    edge_width = 0.11
    if width >= height:
        add_plane_grid(f"{name}_curb_north", (x, y - edge_width, width, edge_width), edge_color, ROAD_Z - 0.002, collection, roughness=0.72)
        add_plane_grid(f"{name}_curb_south", (x, y + height, width, edge_width), edge_color, ROAD_Z - 0.002, collection, roughness=0.72)
    else:
        add_plane_grid(f"{name}_curb_west", (x - edge_width, y, edge_width, height), edge_color, ROAD_Z - 0.002, collection, roughness=0.72)
        add_plane_grid(f"{name}_curb_east", (x + width, y, edge_width, height), edge_color, ROAD_Z - 0.002, collection, roughness=0.72)

    if not has_lane:
        return

    horizontal = width >= height
    dash_count = max(2, int((width if horizontal else height) / 3.0))
    for index in range(dash_count):
        if horizontal:
            dash_w = min(1.4, width / dash_count * 0.5)
            gap = width / dash_count
            dash_rect = (x + index * gap + gap * 0.22, y + height / 2 - 0.06, dash_w, 0.12)
        else:
            dash_h = min(1.4, height / dash_count * 0.5)
            gap = height / dash_count
            dash_rect = (x + width / 2 - 0.06, y + index * gap + gap * 0.22, 0.12, dash_h)
        add_plane_grid(f"{name}_lane_{index + 1:02d}", dash_rect, "#f8fafc", MARKING_Z, collection, roughness=0.48)


def add_sidewalk_ring(name, outer_rect, thickness, collection, color="#e9d8a6"):
    """用四条矩形人行道表达路侧浅黄色边界。"""
    x, y, width, height = outer_rect
    strips = [
        (x, y, width, thickness),
        (x, y + height - thickness, width, thickness),
        (x, y, thickness, height),
        (x + width - thickness, y, thickness, height),
    ]
    for index, strip in enumerate(strips):
        add_plane_grid(f"{name}_{index + 1}", strip, color, SIDEWALK_Z, collection, roughness=0.7)


def add_crosswalk(name, point, collection, rotation=0):
    """用白色短条表示路口斑马线。"""
    grid_x, grid_y = point
    for index in range(4):
        offset = (index - 1.5) * 0.42
        if rotation == 0:
            rect = (grid_x - 1.25 + index * 0.42, grid_y - 1.05, 0.18, 2.1)
        else:
            rect = (grid_x - 1.05, grid_y - 1.25 + index * 0.42, 2.1, 0.18)
        add_plane_grid(f"{name}_{index + 1}", rect, "#f8fafc", MARKING_Z + 0.003, collection, roughness=0.35)


def add_tree(name, point, collection, scale=1.0):
    """地图边界统一使用 assets/models/environment/trees/tree.glb，避免旧树模型混杂。"""
    rotation = math.radians((point[0] * 17 + point[1] * 7) % 360)
    if add_asset_instance(
        "boundary_tree",
        name,
        point,
        collection,
        target_height=2.175 * scale,
        rotation_z=rotation,
    ):
        return

    x, y = world_center(point[0], point[1])
    add_cylinder_world(f"{name}_trunk", x, y, 0.08 * scale, 0.55 * scale, "#8b5a2b", collection, z=0.02, vertices=8)
    bpy.ops.mesh.primitive_cone_add(
        vertices=10,
        radius1=0.42 * scale,
        radius2=0.08 * scale,
        depth=1.05 * scale,
        location=(x, y, 0.58 * scale + 0.42),
    )
    crown = bpy.context.active_object
    crown.name = f"{name}_crown"
    crown.data.materials.append(make_material(f"mat_{name}_crown", "#4f9b5f", roughness=0.9))
    link_object(crown, collection)


def add_grass_cluster(name, point, collection, scale=1.0):
    """用 grass.glb 点缀草地区域，让真实资源在场景里可见。"""
    rotation = math.radians((point[0] * 31 + point[1] * 13) % 360)
    add_asset_instance(
        "grass",
        name,
        point,
        collection,
        target_size=0.55 * scale,
        z=0.04,
        rotation_z=rotation,
    )


def add_light(name, point, collection):
    """用脚本几何体生成路灯，避免外部灯模型带出离群部件。"""
    x, y = world_center(point[0], point[1])
    add_cylinder_world(f"{name}_pole", x, y, 0.045, 1.45, "#64748b", collection, z=0.02, vertices=12, roughness=0.52)
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16,
        ring_count=8,
        radius=0.17,
        location=(x, y, 1.58),
    )
    bulb = bpy.context.active_object
    bulb.name = f"{name}_bulb"
    bulb.data.materials.append(make_material(f"mat_{name}_bulb", "#fde68a", roughness=0.25, emission=("#fde68a", 1.4)))
    link_object(bulb, collection)


def add_fence_line(name, start, end, collection):
    """用基础几何体拼栅栏，避免外部栅栏模型坐标残留到地图外。"""
    start_x, start_y = world_center(start[0], start[1])
    end_x, end_y = world_center(end[0], end[1])
    dx = end_x - start_x
    dy = end_y - start_y
    length = math.hypot(dx, dy)
    if length <= 0.01:
        return
    angle = math.atan2(dy, dx)
    segment_count = max(1, int(length / 1.0))
    for index in range(segment_count):
        t = (index + 0.5) / segment_count
        cx = start_x + dx * t
        cy = start_y + dy * t
        segment = add_box_world(
            f"{name}_rail_{index + 1:02d}",
            cx,
            cy,
            min(0.72, length / segment_count * 0.72),
            0.08,
            0.36,
            "#8b5a2b",
            collection,
            z=0.18,
            roughness=0.62,
            bevel=0.01,
        )
        segment.rotation_euler[2] = angle
    for index, point in enumerate((start, end)):
        x, y = world_center(point[0], point[1])
        add_cylinder_world(f"{name}_post_{index + 1}", x, y, 0.06, 0.55, "#6b3f1d", collection, z=0.06, vertices=8)


def add_residential_block(name, rect, height, collection, label_text=None, variant=0):
    """把旧 60 x 45 场景里的住宅楼细节移植成可缩放原型。"""
    x, y, width, depth = rect
    body_rect = (x + width * 0.08, y + depth * 0.08, width * 0.84, depth * 0.76)
    wall_color = RESIDENTIAL_WALL_LIGHT if variant % 2 else RESIDENTIAL_WALL
    add_box_on_rect(f"{name}_body", body_rect, height * 0.92, wall_color, collection, roughness=0.74, bevel_width=0.04)

    if variant % 3 == 1:
        add_box_on_rect(
            f"{name}_frame_left",
            (x + width * 0.08, y + depth * 0.08, width * 0.13, depth * 0.78),
            height,
            FRAME_DARK,
            collection,
            roughness=0.66,
            bevel_width=0.025,
        )
        add_box_on_rect(
            f"{name}_frame_right",
            (x + width * 0.79, y + depth * 0.08, width * 0.13, depth * 0.78),
            height * 0.96,
            FRAME_DARK,
            collection,
            roughness=0.66,
            bevel_width=0.025,
        )
    elif variant % 3 == 2:
        add_box_on_rect(
            f"{name}_side_mass",
            (x + width * 0.58, y + depth * 0.18, width * 0.28, depth * 0.66),
            height * 0.86,
            RESIDENTIAL_WALL_LIGHT,
            collection,
            roughness=0.76,
            bevel_width=0.035,
        )
        add_box_on_rect(
            f"{name}_vertical_core",
            (x + width * 0.43, y + depth * 0.14, width * 0.13, depth * 0.72),
            height * 0.68,
            STONE_LIGHT,
            collection,
            z_offset=BUILDING_Z + height * 0.16,
            roughness=0.82,
            bevel_width=0.018,
        )
    else:
        add_box_on_rect(
            f"{name}_stair_tower",
            (x + width * 0.08, y + depth * 0.12, width * 0.18, depth * 0.68),
            height,
            FRAME_DARK,
            collection,
            roughness=0.64,
            bevel_width=0.025,
        )
        add_box_on_rect(
            f"{name}_center_frame",
            (x + width * 0.38, y + depth * 0.14, width * 0.24, depth * 0.68),
            height * 0.62,
            STONE_LIGHT,
            collection,
            z_offset=BUILDING_Z + height * 0.2,
            roughness=0.8,
            bevel_width=0.018,
        )

    front_y = y + depth * 0.78
    window_x = x + width * 0.28
    window_width = width * 0.44
    band_count = 4 if height >= 1.75 else 3
    bands = [
        (BUILDING_Z + height * (0.22 + index * 0.18), height * 0.075)
        for index in range(band_count)
    ]
    add_window_bands(name, window_x, front_y, window_width, collection, bands)
    add_floor_bands(
        name,
        x + width * 0.24,
        y + depth * 0.84,
        width * 0.52,
        [BUILDING_Z + height * (0.24 + index * 0.18) for index in range(band_count)],
        depth * 0.08,
        collection,
    )
    add_box_on_rect(
        f"{name}_entry_lobby",
        (x + width * 0.38, y + depth * 0.84, width * 0.24, depth * 0.12),
        height * 0.18,
        ENTRY_DARK,
        collection,
        roughness=0.72,
        bevel_width=0.018,
    )
    add_box_on_rect(
        f"{name}_entry_canopy",
        (x + width * 0.34, y + depth * 0.94, width * 0.32, depth * 0.08),
        0.08,
        METAL_LIGHT,
        collection,
        z_offset=BUILDING_Z + height * 0.28,
        roughness=0.55,
        bevel_width=0.01,
    )
    add_box_on_rect(
        f"{name}_roof_room",
        (x + width * 0.38, y + depth * 0.24, width * 0.24, depth * 0.2),
        0.42,
        ROOF_DARK,
        collection,
        z_offset=BUILDING_Z + height * 0.92,
        roughness=0.72,
        bevel_width=0.025,
    )
    add_roof_parapet(name, body_rect, BUILDING_Z + height * 0.92, collection)
    if label_text:
        add_roof_badge(name, rect, BUILDING_Z + height * 0.92, collection, label_text)


def add_villa(name, point, collection, color="#b7c7ff"):
    """独栋别墅使用真实小住宅模型，形成左侧第二排低密住宅。"""
    grid_x, grid_y = point
    rect = (grid_x - 1.35, grid_y - 1.9, 2.7, 3.8)
    number = int(name.rsplit("_", 1)[-1])
    if add_glb_building(
        "villa",
        name,
        rect,
        collection,
        max_height=1.55,
        rotation_z=SOUTH_FACING_ROTATION,
        fit=0.92,
    ):
        return

    add_residential_block(name, rect, 1.45, collection, None, variant=number)


def add_apartment(name, point, collection):
    """公寓楼使用真实公寓模型，统一成左侧第一排住宅体量。"""
    grid_x, grid_y = point
    rect = (grid_x - 4.15, grid_y - 1.85, 8.3, 3.7)
    number = int(name.rsplit("_", 1)[-1])
    if add_glb_building(
        "apartment",
        name,
        rect,
        collection,
        max_height=2.35,
        rotation_z=SOUTH_FACING_ROTATION,
        fit=0.9,
    ):
        return

    add_residential_block(name, rect, 2.1, collection, None, variant=number)


def add_row_house(name, point, collection, color="#a5b4fc"):
    """兼容旧调用：排屋现在用公寓模型承担。"""
    grid_x, grid_y = point
    add_apartment(name, (grid_x, grid_y), collection)


def add_west_buildings(collection):
    """左侧建筑按稳定 ID 摆放：写字楼、图书馆、物业中心、物流中心。"""
    add_plane_grid("west_building_zone", (6.4, 7.0, 27.2, 77.0), "#e9eef2", GRASS_Z, collection, roughness=0.92)

    for item in WEST_BUILDING_DEFS:
        rect = item["rect"]
        add_marble_floor(f"{item['id']}_marble_floor", rect, collection, padding=0.7)
        add_glb_building(
            item["asset"],
            item["id"],
            rect,
            collection,
            max_height=item["height"],
            rotation_z=SOUTH_FACING_ROTATION,
            fit=item.get("fit", 0.86),
        )


def add_public_building(name, label, rect, color, collection, height=2.4, text_color="#0f172a"):
    """通用公共楼原型：保留标签，同时补入口、窗带、屋顶和女儿墙。"""
    x, y, width, depth = rect
    body_rect = (x + width * 0.06, y + depth * 0.08, width * 0.88, depth * 0.74)
    add_box_on_rect(f"{name}_body", body_rect, height * 0.88, color, collection, roughness=0.72, bevel_width=0.07)
    add_box_on_rect(
        f"{name}_front_glass",
        (x + width * 0.24, y + depth * 0.78, width * 0.52, depth * 0.08),
        height * 0.46,
        GLASS_LIGHT,
        collection,
        z_offset=BUILDING_Z + height * 0.22,
        roughness=0.42,
        bevel_width=0.015,
    )
    add_window_bands(
        name,
        x + width * 0.18,
        y + depth * 0.72,
        width * 0.64,
        collection,
        [(BUILDING_Z + height * 0.48, height * 0.1), (BUILDING_Z + height * 0.66, height * 0.1)],
        color=GLASS_BLUE,
    )
    add_box_on_rect(
        f"{name}_entry",
        (x + width * 0.42, y + depth * 0.84, width * 0.16, depth * 0.1),
        height * 0.26,
        ENTRY_DARK,
        collection,
        roughness=0.68,
        bevel_width=0.02,
    )
    add_box_on_rect(
        f"{name}_canopy",
        (x + width * 0.34, y + depth * 0.93, width * 0.32, depth * 0.07),
        0.1,
        METAL_LIGHT,
        collection,
        z_offset=BUILDING_Z + height * 0.48,
        roughness=0.52,
        bevel_width=0.012,
    )
    add_box_on_rect(
        f"{name}_roof_inset",
        (x + width * 0.22, y + depth * 0.22, width * 0.56, depth * 0.36),
        0.18,
        "#f8fafc",
        collection,
        z_offset=BUILDING_Z + height * 0.88,
        roughness=0.5,
        bevel_width=0.02,
    )
    add_roof_parapet(name, body_rect, BUILDING_Z + height * 0.88, collection)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height * 0.88 + 0.26, collection, size=0.34, color=text_color)


def add_service_building(name, label, rect, color, collection, height):
    """住户服务类建筑：主体加两侧翼楼，接近旧场景的正式小区服务楼。"""
    x, y, width, depth = rect
    base_rect = (x + width * 0.06, y + depth * 0.1, width * 0.88, depth * 0.72)
    add_box_on_rect(f"{name}_body", base_rect, height * 0.86, WALL_WARM, collection, roughness=0.74, bevel_width=0.06)
    add_box_on_rect(f"{name}_wing_left", (x + width * 0.06, y + depth * 0.12, width * 0.18, depth * 0.68), height * 0.72, STONE_LIGHT, collection)
    add_box_on_rect(f"{name}_wing_right", (x + width * 0.76, y + depth * 0.12, width * 0.18, depth * 0.68), height * 0.72, STONE_LIGHT, collection)
    add_box_on_rect(f"{name}_lobby", (x + width * 0.34, y + depth * 0.78, width * 0.32, depth * 0.12), height * 0.58, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_canopy", (x + width * 0.3, y + depth * 0.91, width * 0.4, depth * 0.06), 0.1, METAL_LIGHT, collection, z_offset=BUILDING_Z + height * 0.52, roughness=0.52, bevel_width=0.012)
    add_window_bands(name, x + width * 0.26, y + depth * 0.72, width * 0.48, collection, [(BUILDING_Z + height * 0.36, height * 0.09), (BUILDING_Z + height * 0.58, height * 0.09)])
    add_box_on_rect(f"{name}_roof_room", (x + width * 0.4, y + depth * 0.28, width * 0.18, depth * 0.18), 0.42, ROOF_DARK, collection, z_offset=BUILDING_Z + height * 0.86, roughness=0.72)
    add_roof_parapet(name, base_rect, BUILDING_Z + height * 0.86, collection)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height * 0.86 + 0.26, collection, size=0.34, color="#0f172a")


def add_party_center_building(name, label, rect, collection, height):
    """党群中心用圆形主楼和红色入口轴，延续旧场景里的识别点。"""
    x, y, width, depth = rect
    base_rect = (x + width * 0.16, y + depth * 0.14, width * 0.68, depth * 0.7)
    add_cylinder_grid(f"{name}_body", base_rect, height * 0.86, WALL_WARM, collection, vertices=32, roughness=0.74)
    add_cylinder_grid(f"{name}_top_cap", (x + width * 0.24, y + depth * 0.22, width * 0.52, depth * 0.5), 0.22, WALL_LIGHT, collection, z=BUILDING_Z + height * 0.86, vertices=32, roughness=0.82, bevel=0.012)
    add_cylinder_grid(f"{name}_glass_ring", (x + width * 0.24, y + depth * 0.22, width * 0.52, depth * 0.5), 0.16, GLASS_BLUE, collection, z=BUILDING_Z + height * 0.48, vertices=32, roughness=0.38, bevel=0.012)
    add_box_on_rect(f"{name}_entry_lobby", (x + width * 0.32, y + depth * 0.76, width * 0.36, depth * 0.12), height * 0.58, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_entry_portal", (x + width * 0.28, y + depth * 0.88, width * 0.44, depth * 0.06), 0.16, PLAZA_RED, collection, z_offset=BUILDING_Z + height * 0.48, roughness=0.44, bevel_width=0.018)
    add_box_on_rect(f"{name}_front_axis", (x + width * 0.48, y + depth * 0.7, width * 0.04, depth * 0.08), height * 0.7, PLAZA_RED, collection, z_offset=BUILDING_Z + height * 0.12, roughness=0.56, bevel_width=0.01)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height + 0.2, collection, size=0.32, color="#7f1d1d")


def add_express_center_building(name, label, rect, collection, height):
    """快递中心强调装卸口和办公体块，方便和配送业务挂钩。"""
    x, y, width, depth = rect
    hall_rect = (x + width * 0.04, y + depth * 0.08, width * 0.9, depth * 0.74)
    add_box_on_rect(f"{name}_hall", hall_rect, height * 0.84, WALL_LIGHT, collection, roughness=0.78, bevel_width=0.055)
    add_box_on_rect(f"{name}_office", (x + width * 0.62, y + depth * 0.52, width * 0.28, depth * 0.24), height * 0.66, STONE_LIGHT, collection, roughness=0.74, bevel_width=0.035)
    add_box_on_rect(f"{name}_dock_canopy", (x + width * 0.01, y + depth * 0.16, width * 0.05, depth * 0.5), 0.16, METAL_LIGHT, collection, z_offset=BUILDING_Z + height * 0.62, roughness=0.58, bevel_width=0.01)
    for index, door_y in enumerate((0.2, 0.38, 0.56), start=1):
        add_box_on_rect(
            f"{name}_dock_door_{index}",
            (x + width * 0.06, y + depth * door_y, width * 0.035, depth * 0.12),
            height * 0.42,
            FRAME_DARK,
            collection,
            z_offset=BUILDING_Z + height * 0.12,
            roughness=0.7,
            bevel_width=0.01,
        )
    add_box_on_rect(f"{name}_front_glass", (x + width * 0.68, y + depth * 0.78, width * 0.2, depth * 0.08), height * 0.36, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_roof_strip", (x + width * 0.24, y + depth * 0.2, width * 0.46, depth * 0.18), 0.18, LOGISTICS_GREEN, collection, z_offset=BUILDING_Z + height * 0.84, roughness=0.7)
    add_roof_parapet(name, hall_rect, BUILDING_Z + height * 0.84, collection)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height * 0.84 + 0.26, collection, size=0.34, color="#064e3b")


def add_sports_building(name, label, rect, collection, height):
    """运动中心补运动馆玻璃入口和屋顶色带。"""
    x, y, width, depth = rect
    base_rect = (x + width * 0.06, y + depth * 0.1, width * 0.88, depth * 0.72)
    add_box_on_rect(f"{name}_body", base_rect, height * 0.78, WALL_LIGHT, collection, roughness=0.76, bevel_width=0.06)
    add_box_on_rect(f"{name}_glass_hall", (x + width * 0.24, y + depth * 0.78, width * 0.5, depth * 0.1), height * 0.56, GLASS_LIGHT, collection, roughness=0.42)
    add_box_on_rect(f"{name}_roof_band", (x + width * 0.27, y + depth * 0.25, width * 0.42, depth * 0.38), 0.55, SPORTS_AQUA, collection, z_offset=BUILDING_Z + height * 0.78, roughness=0.68)
    add_box_on_rect(f"{name}_accent_left", (x + width * 0.08, y + depth * 0.74, width * 0.03, depth * 0.08), height * 0.48, SPORTS_AQUA, collection, z_offset=BUILDING_Z + height * 0.18, roughness=0.6)
    add_box_on_rect(f"{name}_accent_right", (x + width * 0.88, y + depth * 0.74, width * 0.03, depth * 0.08), height * 0.42, SPORTS_ORANGE, collection, z_offset=BUILDING_Z + height * 0.22, roughness=0.6)
    add_roof_parapet(name, base_rect, BUILDING_Z + height * 0.78, collection)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height * 0.78 + 0.28, collection, size=0.32, color="#0f172a")


def add_comprehensive_building(name, label, rect, collection, height):
    """综合楼使用椭圆体量，和普通矩形楼拉开差异。"""
    x, y, width, depth = rect
    ellipse_rect = (x + width * 0.07, y + depth * 0.12, width * 0.86, depth * 0.68)
    add_cylinder_grid(f"{name}_body", ellipse_rect, height * 0.84, STONE_LIGHT, collection, vertices=32, roughness=0.74)
    add_cylinder_grid(f"{name}_glass_ring", (x + width * 0.16, y + depth * 0.22, width * 0.68, depth * 0.46), 0.16, GLASS_BLUE, collection, z=BUILDING_Z + height * 0.42, vertices=32, roughness=0.38, bevel=0.012)
    add_cylinder_grid(f"{name}_roof_cap", (x + width * 0.24, y + depth * 0.3, width * 0.52, depth * 0.3), 0.3, ROOF_DARK, collection, z=BUILDING_Z + height * 0.84, vertices=32, roughness=0.72, bevel=0.012)
    add_box_on_rect(f"{name}_entry_lobby", (x + width * 0.3, y + depth * 0.78, width * 0.4, depth * 0.12), height * 0.62, FRAME_DEEP, collection, roughness=0.68)
    add_box_on_rect(f"{name}_entry_glass", (x + width * 0.35, y + depth * 0.82, width * 0.3, depth * 0.06), height * 0.48, GLASS_LIGHT, collection, roughness=0.4)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height * 0.84 + 0.42, collection, size=0.32, color="#0f172a")


def add_power_room_building(name, label, rect, collection, height):
    """发电间加百叶、屋顶设备和橙色提示，让小建筑也有辨识度。"""
    x, y, width, depth = rect
    base_rect = (x + width * 0.08, y + depth * 0.12, width * 0.74, depth * 0.7)
    add_box_on_rect(f"{name}_body", base_rect, height * 0.76, STONE_LIGHT, collection, roughness=0.82, bevel_width=0.04)
    for index, strip_x in enumerate((0.18, 0.32, 0.46, 0.6), start=1):
        add_box_on_rect(f"{name}_louver_{index}", (x + width * strip_x, y + depth * 0.72, width * 0.05, depth * 0.04), height * 0.45, FRAME_DARK, collection, z_offset=BUILDING_Z + height * 0.18, roughness=0.68, bevel_width=0.01)
    add_box_on_rect(f"{name}_entry", (x + width * 0.34, y + depth * 0.78, width * 0.2, depth * 0.08), height * 0.34, ENTRY_DARK, collection, roughness=0.72)
    add_box_on_rect(f"{name}_roof_vent", (x + width * 0.36, y + depth * 0.28, width * 0.2, depth * 0.18), 0.36, ROOF_DARK, collection, z_offset=BUILDING_Z + height * 0.76, roughness=0.72)
    add_box_on_rect(f"{name}_roof_stack", (x + width * 0.62, y + depth * 0.34, width * 0.08, depth * 0.08), 0.52, FRAME_DARK, collection, z_offset=BUILDING_Z + height * 0.76, roughness=0.68)
    add_box_on_rect(f"{name}_warning", (x + width * 0.18, y + depth * 0.18, width * 0.22, depth * 0.08), 0.12, UTILITY_ORANGE, collection, z_offset=BUILDING_Z + height * 0.76 + 0.04, roughness=0.52, bevel_width=0.01)
    add_roof_parapet(name, base_rect, BUILDING_Z + height * 0.76, collection)
    add_text_label(f"{name}_label", label, (x + width / 2, y + depth / 2), BUILDING_Z + height * 0.76 + 0.26, collection, size=0.28, color="#7c2d12")


def add_named_public_building(name, label, rect, color, collection, height):
    """按业务建筑类型分发到更细的旧场景原型。"""
    if name in {"resident_service", "property_center", "east_service", "life_support", "community_station"}:
        add_service_building(name, label, rect, color, collection, height)
    elif name == "party_center":
        add_party_center_building(name, label, rect, collection, height)
    elif name == "express_center":
        add_express_center_building(name, label, rect, collection, height)
    elif name == "sports_center":
        add_sports_building(name, label, rect, collection, height)
    elif name == "comprehensive":
        add_comprehensive_building(name, label, rect, collection, height)
    elif name == "power_room":
        add_power_room_building(name, label, rect, collection, height)
    else:
        add_public_building(name, label, rect, color, collection, height=height)


def add_restaurant(name, rect, collection, label="韩式饭店"):
    """优先导入 korean_bakery.glb 作为真实建筑资源，失败时用低模体块兜底。"""
    add_box_grid(f"{name}_base", rect, 0.22, "#f6d9b6", collection, z=0.035, roughness=0.68, bevel=0.03)
    asset_path = ASSET_SPECS["korean_bakery"]["path"]
    if not asset_path.exists():
        add_public_building(name, label, rect, "#f97316", collection, height=2.2, text_color="#fff7ed")
        return

    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=str(asset_path))
    except Exception:
        add_public_building(name, label, rect, "#f97316", collection, height=2.2, text_color="#fff7ed")
        return

    imported = [obj for obj in bpy.data.objects if obj not in before]
    if not imported:
        add_public_building(name, label, rect, "#f97316", collection, height=2.2, text_color="#fff7ed")
        return

    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    for obj in imported:
        link_object(obj, collection)
        obj.parent = root

    min_corner = Vector((math.inf, math.inf, math.inf))
    max_corner = Vector((-math.inf, -math.inf, -math.inf))
    for obj in imported:
        if not hasattr(obj, "bound_box"):
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            min_corner.x = min(min_corner.x, world.x)
            min_corner.y = min(min_corner.y, world.y)
            min_corner.z = min(min_corner.z, world.z)
            max_corner.x = max(max_corner.x, world.x)
            max_corner.y = max(max_corner.y, world.y)
            max_corner.z = max(max_corner.z, world.z)

    size = max_corner - min_corner
    if min(size.x, size.y, size.z) <= 0:
        add_public_building(f"{name}_fallback", label, rect, "#f97316", collection, height=2.2, text_color="#fff7ed")
        return

    target_x, target_y = world_center(rect[0], rect[1], rect[2], rect[3])
    target_width = rect[2] * TILE_SIZE * 0.82
    target_depth = rect[3] * TILE_SIZE * 0.82
    scale = min(target_width / size.x, target_depth / size.y, 2.4 / size.z)
    center = (min_corner + max_corner) * 0.5
    root.scale = (scale, scale, scale)
    root.location = (
        target_x - center.x * scale,
        target_y - center.y * scale,
        BUILDING_Z - min_corner.z * scale,
    )
    add_text_label(f"{name}_label", label, (rect[0] + rect[2] / 2, rect[1] + rect[3] + 0.7), 0.2, collection, size=0.38, color="#8b3a13")


def add_marker(name, point, label, color, collection, show_label=True):
    """业务点位用彩色柱和文字标识，便于讲清楚配送链路。"""
    x, y = world_center(point[0], point[1])
    add_cylinder_world(f"{name}_base", x, y, 0.22, 0.08, color, collection, z=0.08, vertices=32, emission=(color, 0.6))
    add_cylinder_world(f"{name}_pin", x, y, 0.075, 0.82, color, collection, z=0.12, vertices=20, emission=(color, 0.8))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.17, location=(x, y, 1.05))
    orb = bpy.context.active_object
    orb.name = f"{name}_orb"
    orb.data.materials.append(make_material(f"mat_{name}_orb", color, roughness=0.24, emission=(color, 1.2)))
    link_object(orb, collection)
    if show_label:
        add_text_label(f"{name}_label", label, (point[0] + 1.6, point[1] - 0.2), 0.14, collection, size=0.24, color="#0f172a")


def add_ground(collection):
    """创建 SVG 草图对应的 100 x 90 园区底板。"""
    add_plane_grid("world_ground", (0, 0, GRID_COLS, GRID_ROWS), "#edf4ef", GROUND_Z, collection, roughness=0.96)
    add_sidewalk_ring("campus_boundary_curb", (1.5, 1.5, 97.0, 87.0), 0.45, collection, color="#2e3842")
    add_sidewalk_ring("campus_inner_walkway", (4.0, 4.0, 92.0, 82.0), 1.1, collection, color="#d8e0e6")


def add_outer_landscape(collection):
    """外围绿带形成地图边界，内部留给建筑和道路。"""
    add_sidewalk_ring("outer_green_belt", (2.6, 2.6, 94.8, 84.8), 2.2, collection, color="#a9d8ad")

    for index, x in enumerate(range(6, 95, 5)):
        add_tree(f"boundary_tree_north_{index + 1}", (x, 1.1 + (index % 2) * 0.18), collection)
        add_tree(f"boundary_tree_south_{index + 1}", (x, 88.9 - (index % 2) * 0.18), collection)
    for index, y in enumerate(range(6, 85, 5)):
        add_tree(f"boundary_tree_west_{index + 1}", (1.1 + (index % 2) * 0.18, y), collection)
        add_tree(f"boundary_tree_east_{index + 1}", (98.9 - (index % 2) * 0.18, y), collection)


def add_roads(collection):
    """生成公共道路和建筑专属入口路，和世界规则保持同一套道路语义。"""
    asphalt = "#30353a"
    service_asphalt = "#42484e"
    sidewalk = "#dce5ea"
    warm_walk = "#dce5ea"
    driveway_paver = "#cfd8de"

    def add_road_with_walks(name, rect, color, has_lane=False, walk_color=sidewalk, walk_width=0.55):
        x, y, width, height = rect
        if width >= height:
            walk_rects = [
                (f"{name}_walk_north", (x, y - walk_width, width, 0.42)),
                (f"{name}_walk_south", (x, y + height + 0.16, width, 0.42)),
            ]
        else:
            walk_rects = [
                (f"{name}_walk_west", (x - walk_width, y, 0.42, height)),
                (f"{name}_walk_east", (x + width + 0.16, y, 0.42, height)),
            ]

        for walk_name, walk_rect in walk_rects:
            add_plane_grid(walk_name, walk_rect, walk_color, SIDEWALK_Z, collection, roughness=0.74)
            add_tile_grid(
                f"{walk_name}_tile",
                walk_rect,
                collection,
                SIDEWALK_Z + 0.003,
                step=1.25,
                color="#c5d0d7",
                line_width=0.026,
                alpha=0.45,
            )
        add_road(name, rect, collection, color, has_lane=has_lane)

    public_roads = [
        ("north_loop", (3.0, 2.9, 94.0, 2.2), asphalt, True),
        ("south_loop", (3.0, 84.9, 94.0, 2.2), asphalt, True),
        ("west_loop", (1.9, 4.0, 2.2, 82.0), asphalt, True),
        ("east_loop", (95.9, 4.0, 2.2, 82.0), asphalt, True),
        ("west_center_spine", (35.7, 4.0, 2.2, 82.0), asphalt, True),
        ("west_office_front", (3.0, 29.0, 33.8, 2.0), service_asphalt, False),
        ("west_library_front", (3.0, 46.5, 33.8, 2.0), service_asphalt, False),
        ("west_property_front", (3.0, 64.4, 33.8, 2.0), service_asphalt, False),
        ("food_middle_spine", (51.6, 4.0, 2.0, 27.5), service_asphalt, False),
        ("center_east_spine", (66.3, 4.0, 2.2, 82.0), asphalt, True),
        ("food_north_front", (36.8, 19.4, 30.6, 2.0), service_asphalt, False),
        ("food_mid_front", (36.8, 30.6, 30.6, 2.0), service_asphalt, False),
        ("park_south_food_front", (36.8, 56.3, 30.6, 2.0), service_asphalt, False),
        ("food_south_front", (36.8, 69.2, 30.6, 2.0), service_asphalt, False),
        ("apartment_center_spine", (81.1, 4.0, 2.0, 36.5), service_asphalt, False),
        ("apartment_first_front", (67.4, 23.0, 29.6, 2.0), service_asphalt, False),
        ("apartment_second_front", (67.4, 39.45, 29.6, 2.1), service_asphalt, False),
        ("villa_west_inner_spine", (76.3, 40.5, 1.8, 45.5), service_asphalt, False),
        ("villa_east_inner_spine", (85.1, 40.5, 1.8, 45.5), service_asphalt, False),
        ("villa_row_1_front", (67.4, 54.0, 29.6, 2.0), service_asphalt, False),
        ("villa_row_2_front", (67.4, 69.2, 29.6, 2.0), service_asphalt, False),
    ]
    for name, rect, color, has_lane in public_roads:
        add_road_with_walks(name, rect, color, has_lane=has_lane, walk_color=sidewalk if has_lane else warm_walk, walk_width=0.45)

    access_driveways = [
        ("access_west_office", 19.75, 28.82, 30.0),
        ("access_west_library", 19.5, 46.2, 47.5),
        ("access_west_property_center", 19.4, 64.2, 65.4),
        ("access_west_logistics_center", 19.5, 79.2, 86.0),
        ("access_food_japanese_cuisine", 45.3, 18.25, 20.4),
        ("access_food_paris_restaurant", 60.8, 18.25, 20.4),
        ("access_food_japanese_ramen", 45.3, 29.15, 31.6),
        ("access_food_samhui_restaurant", 60.8, 29.15, 31.6),
        ("access_food_japanese_vendor", 44.7, 67.85, 70.2),
        ("access_food_korean_bakery", 60.7, 67.85, 70.2),
        ("access_food_booking_lot_restaurant", 57.4, 85.0, 86.0),
        ("access_apt_a1", 73.6, 18.25, 24.0),
        ("access_apt_a2", 89.6, 18.25, 24.0),
        ("access_apt_a3", 73.6, 34.75, 40.5),
        ("access_apt_a4", 89.6, 34.75, 40.5),
        ("access_villa_b1", 72.75, 49.05, 55.0),
        ("access_villa_b2", 81.85, 49.05, 55.0),
        ("access_villa_b3", 90.15, 49.05, 55.0),
        ("access_villa_b4", 72.75, 65.75, 70.2),
        ("access_villa_b5", 81.85, 65.75, 70.2),
        ("access_villa_b6", 90.15, 65.75, 70.2),
        ("access_villa_b7", 72.75, 81.05, 86.0),
        ("access_villa_b8", 81.85, 81.05, 86.0),
        ("access_villa_b9", 90.15, 81.05, 86.0),
    ]
    for name, x, door_y, road_y in access_driveways:
        y_start = min(door_y, road_y)
        height = abs(road_y - door_y)
        if height <= 0:
            continue
        path_rect = (x - 0.24, y_start, 0.48, height)
        add_plane_grid(name, path_rect, driveway_paver, MARKING_Z - 0.006, collection, roughness=0.78, alpha=0.64)
        add_tile_grid(
            f"{name}_paver_joints",
            path_rect,
            collection,
            MARKING_Z - 0.003,
            step=0.75,
            color="#e6edf2",
            line_width=0.018,
            alpha=0.35,
        )

    # 中央公园只做人行环路，保留公园作为地图核心视觉。
    park_walks = [
        ("park_walk_north", (38.3, 31.2, 28.4, 0.8)),
        ("park_walk_south", (38.3, 56.2, 28.4, 0.8)),
        ("park_walk_west", (38.3, 31.2, 0.8, 25.8)),
        ("park_walk_east", (65.9, 31.2, 0.8, 25.8)),
    ]
    for name, rect in park_walks:
        add_plane_grid(name, rect, "#cdbf8b", MARKING_Z - 0.003, collection, roughness=0.68, alpha=0.9)

    for point, rotation in [
        ((36.9, 19.8), 90),
        ((36.9, 31.2), 90),
        ((82.2, 24.0), 90),
        ((82.2, 40.2), 90),
        ((97.8, 40.2), 0),
        ((36.9, 86.9), 90),
    ]:
        add_crosswalk(f"crosswalk_{point[0]:.0f}_{point[1]:.0f}", point, collection, rotation=rotation)


def add_residential_zones(collection):
    """右侧住宅区：北侧 2x2 公寓，南侧 3x3 独栋 house。"""
    add_grass_floor("east_house_lawn", (66.5, 8.0, 30.5, 75.0), collection, padding=0.0)

    for item in APARTMENT_DEFS:
        rect = item["rect"]
        add_glb_building("apartment", item["id"], rect, collection, max_height=2.25, rotation_z=SOUTH_FACING_ROTATION, fit=0.9)

    for item in VILLA_DEFS:
        rect = item["rect"]
        add_glb_building("villa", item["id"], rect, collection, max_height=1.65, rotation_z=HOUSE_CLOCKWISE_ROTATION, fit=0.92)


def add_central_park(collection):
    """中央公园使用 assets/models/environment/parks 里的真实 park 模型，保留稳定 ID park_center。"""
    add_glb_building(
        "minecraft_park",
        "park_center",
        CENTRAL_PARK_RECT,
        collection,
        rotation_z=SOUTH_FACING_ROTATION,
        fit=0.92,
        base_color=None,
    )


def add_public_area(collection):
    """中部使用餐饮和糕点资源围绕中央公园布局。"""
    add_plane_grid("center_service_zone", (38.0, 6.5, 30.0, 79.0), "#eef4ef", GRASS_Z, collection, roughness=0.96)

    for item in FOOD_BUILDING_DEFS:
        rect = item["rect"]
        if item["id"] in {"food_japanese_cuisine", "food_paris_restaurant", "food_japanese_ramen", "food_samhui_restaurant"}:
            add_marble_floor(f"{item['id']}_marble_floor", rect, collection, padding=0.55)
        elif item["id"] in {"food_japanese_vendor", "food_korean_bakery", "food_booking_lot_restaurant"}:
            add_grass_floor(f"{item['id']}_grass_floor", rect, collection, padding=0.65)
        add_glb_building(
            item["asset"],
            item["id"],
            rect,
            collection,
            max_height=item["height"],
            rotation_z=item.get("rotation", SOUTH_FACING_ROTATION),
            fit=item.get("fit", 0.94 if item["id"] == "food_booking_lot_restaurant" else 0.9),
            z_offset=item.get("z_offset", 0.0),
        )


def add_lights_and_markers(collection):
    """静态场景不再烘焙路灯、路标和 bot，避免地图出现零散干扰物。"""


def add_coordinate_guide(collection):
    """在地图外侧标注方向和坐标，方便后续按东西南北描述微调。"""
    tick_color = "#334155"
    axis_color = "#0f172a"

    add_plane_grid("coord_band_north", (0, -5.0, GRID_COLS, 3.4), "#eaf1f7", MARKING_Z - 0.01, collection, roughness=0.78)
    add_plane_grid("coord_band_south", (0, 91.1, GRID_COLS, 4.2), "#eaf1f7", MARKING_Z - 0.01, collection, roughness=0.78)
    add_plane_grid("coord_band_west", (-4.4, 0, 3.0, GRID_ROWS), "#eaf1f7", MARKING_Z - 0.01, collection, roughness=0.78)
    add_plane_grid("coord_band_east", (101.4, 0, 3.0, GRID_ROWS), "#eaf1f7", MARKING_Z - 0.01, collection, roughness=0.78)

    add_text_label("coord_title_north", "北 N / y=0", (50, -3.85), 0.11, collection, size=0.72, color=axis_color)
    add_text_label("coord_title_south", "南 S / y=90", (50, 93.15), 0.11, collection, size=0.72, color=axis_color)
    add_text_label("coord_title_west", "西 W / x=0", (-2.9, 45), 0.11, collection, size=0.5, color=axis_color)
    add_text_label("coord_title_east", "东 E / x=100", (102.9, 45), 0.11, collection, size=0.5, color=axis_color)
    add_text_label("coord_note", "坐标：x 西→东，y 北→南", (50, 94.65), 0.11, collection, size=0.4, color="#475569")

    for x in range(0, GRID_COLS + 1, 20):
        add_plane_grid(f"coord_x_tick_north_{x}", (x - 0.12, -1.25, 0.24, 1.6), tick_color, MARKING_Z + 0.006, collection, roughness=0.5)
        add_plane_grid(f"coord_x_tick_south_{x}", (x - 0.12, GRID_ROWS - 0.35, 0.24, 1.6), tick_color, MARKING_Z + 0.006, collection, roughness=0.5)
        add_text_label(f"coord_x_label_north_{x}", f"x={x}", (x, -2.35), 0.1, collection, size=0.34, color=tick_color)
        add_text_label(f"coord_x_label_south_{x}", f"x={x}", (x, 91.85), 0.1, collection, size=0.34, color=tick_color)

    for y in range(0, GRID_ROWS + 1, 15):
        add_plane_grid(f"coord_y_tick_west_{y}", (-1.25, y - 0.12, 1.6, 0.24), tick_color, MARKING_Z + 0.006, collection, roughness=0.5)
        add_plane_grid(f"coord_y_tick_east_{y}", (GRID_COLS - 0.35, y - 0.12, 1.6, 0.24), tick_color, MARKING_Z + 0.006, collection, roughness=0.5)
        add_text_label(f"coord_y_label_west_{y}", f"y={y}", (-2.65, y), 0.1, collection, size=0.3, color=tick_color)
        add_text_label(f"coord_y_label_east_{y}", f"y={y}", (102.05, y), 0.1, collection, size=0.3, color=tick_color)


def remove_outlier_meshes():
    """清理导入外部 GLB 时带进来的离群网格，避免预览里出现远处散点。"""
    max_x = GRID_COLS * TILE_SIZE / 2 + 4
    max_y = GRID_ROWS * TILE_SIZE / 2 + 4
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or not hasattr(obj, "bound_box"):
            continue

        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        min_x = min(point.x for point in points)
        max_obj_x = max(point.x for point in points)
        min_y = min(point.y for point in points)
        max_obj_y = max(point.y for point in points)
        max_z = max(point.z for point in points)

        if min_x < -max_x or max_obj_x > max_x or min_y < -max_y or max_obj_y > max_y or max_z > 18:
            bpy.data.objects.remove(obj, do_unlink=True)


def setup_lighting_and_camera():
    """设置静态沙盘的观察角度和柔和光照。"""
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.world.color = (0.93, 0.97, 1.0)

    # SVG 中南边在画面下方；Blender 里对应负 Y 方向，主光从南侧打进来。
    bpy.ops.object.light_add(type="SUN", location=(0, -34, 34))
    sun = bpy.context.active_object
    sun.name = "main_sun"
    sun.data.energy = 2.8
    sun.rotation_euler = (math.radians(48), 0, math.radians(0))

    bpy.ops.object.light_add(type="AREA", location=(8, -28, 24))
    area = bpy.context.active_object
    area.name = "soft_sky_area"
    area.data.energy = 620
    area.data.size = 24

    bpy.ops.object.camera_add(location=(28, -50, 42), rotation=(math.radians(60), 0, math.radians(34)))
    camera = bpy.context.active_object
    camera.name = "overview_camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 70
    look_at(camera, Vector((0, 0, 0)))
    scene.camera = camera

    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1200
    scene.eevee.taa_render_samples = 64


def look_at(obj, target):
    """让相机看向场景中心。"""
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def generate_scene():
    """按 SVG 规划图生成完整静态场景。"""
    clear_scene()
    ground = ensure_collection("01_Ground")
    roads = ensure_collection("02_Roads")
    landscape = ensure_collection("03_Landscape")
    buildings = ensure_collection("04_Buildings")
    markers = ensure_collection("05_Markers")

    add_ground(ground)
    add_outer_landscape(landscape)
    add_roads(roads)
    add_west_buildings(buildings)
    add_residential_zones(buildings)
    add_central_park(landscape)
    add_public_area(buildings)
    add_lights_and_markers(markers)
    remove_outlier_meshes()
    cleanup_asset_templates()
    merge_static_plane_meshes()
    setup_lighting_and_camera()


def export_scene():
    """保存当前 Blender 场景，并按开关决定是否导出前端资源。"""
    OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))

    if EXPORT_GLB:
        bpy.ops.export_scene.gltf(
            filepath=str(OUTPUT_GLB),
            export_format="GLB",
            use_selection=False,
            export_yup=True,
            export_apply=True,
            **GLB_DRACO_EXPORT_OPTIONS,
        )

    if RENDER_PREVIEW:
        bpy.context.scene.render.filepath = str(OUTPUT_PREVIEW)
        bpy.ops.render.render(write_still=True)


generate_scene()
export_scene()
print(f"已保存 {OUTPUT_BLEND}")
if EXPORT_GLB:
    print(f"已导出 {OUTPUT_GLB}")
else:
    print("已跳过 GLB 导出")
if RENDER_PREVIEW:
    print(f"已渲染 {OUTPUT_PREVIEW}")
else:
    print("已跳过预览图渲染")
