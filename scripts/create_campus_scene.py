"""用 Blender 自动生成低模园区沙盘模型。"""

from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "frontend" / "public" / "scene" / "campus"
BLEND_PATH = OUTPUT_DIR / "campus.blend"
GLB_PATH = OUTPUT_DIR / "campus.glb"


def clear_scene():
    """清空默认场景。"""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def material(name, color, roughness=0.7, metallic=0.0, emission=None, strength=0.0):
    """创建基础材质。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")

    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic

        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = strength

    return mat


def add_bevel(obj, width=0.08, segments=2):
    """给方块增加圆润边缘。"""
    bevel = obj.modifiers.new("soft bevel", "BEVEL")
    bevel.width = width
    bevel.segments = segments
    bevel.affect = "EDGES"
    normal = obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, mat, bevel=0.0):
    """添加立方体，scale 直接表示最终尺寸。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)

    if bevel:
        add_bevel(obj, bevel, 2)

    return obj


def cylinder(name, loc, radius, depth, mat, vertices=24, bevel=False):
    """添加圆柱体。"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)

    if bevel:
        add_bevel(obj, 0.03, 1)

    return obj


def sphere(name, loc, radius, mat, segments=12):
    """添加低模球体。"""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def cone(name, loc, radius1, radius2, depth, mat, vertices=8):
    """添加低模圆锥。"""
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def road_segment(name, x, y, width, depth, mat):
    """添加道路方块。"""
    return cube(name, (x, y, 0.07), (width, depth, 0.08), mat, 0.08)


def road_junction(name, x, y, radius, mat):
    """添加圆形路口。"""
    obj = cylinder(name, (x, y, 0.095), radius, 0.08, mat, 40)
    obj.rotation_euler[0] = 0
    return obj


def add_windows(parent_name, x, y, z, width, face_y, mat):
    """添加一排窗户。"""
    count = max(3, int(width / 0.48))
    spacing = width / (count + 1)

    for index in range(1, count + 1):
        wx = x - width / 2 + spacing * index
        cube(f"{parent_name}_window_{z}_{index}", (wx, face_y, z), (0.22, 0.035, 0.16), mat, 0.01)


def building(config, mats):
    """创建一栋低模建筑。"""
    x, y = config["x"], config["y"]
    width, depth, height = config["width"], config["depth"], config["height"]

    cube(f"{config['name']}_base", (x, y, 0.08), (width + 0.5, depth + 0.5, 0.16), mats["stone"], 0.08)
    cube(f"{config['name']}_body", (x, y, height / 2 + 0.16), (width, depth, height), config["body"], 0.08)
    cube(f"{config['name']}_roof", (x, y, height + 0.34), (width + 0.35, depth + 0.35, 0.28), config["roof"], 0.12)

    front_y = y - depth / 2 - 0.025
    cube(f"{config['name']}_door", (x, front_y, 0.55), (0.44, 0.06, 0.74), config["door"], 0.02)
    cube(f"{config['name']}_awning", (x, front_y - 0.18, 0.98), (1.05, 0.38, 0.1), config["roof"], 0.04)
    add_windows(config["name"], x, y, 0.9, width, front_y - 0.01, mats["glass"])

    if height > 1.45:
        add_windows(config["name"], x, y, 1.38, width, front_y - 0.01, mats["glass"])

    if config["name"] == "express_station":
        for index, px in enumerate([-0.72, -0.36, 0.36, 0.74]):
            cube(
                f"express_parcel_{index}",
                (x + px, front_y - 0.7 - index * 0.04, 0.23),
                (0.32, 0.32, 0.28),
                mats["parcel"],
                0.03,
            )

        for index, px in enumerate([-0.9, -0.35, 0.2, 0.75]):
            cube(
                f"parking_line_{index}",
                (x + px, front_y - 1.45, 0.125),
                (0.08, 0.9, 0.025),
                mats["white"],
                0.0,
            )


def tree(name, x, y, scale, trunk_mat, leaf_mat, style=0):
    """创建低模树。"""
    cylinder(f"{name}_trunk", (x, y, 0.38 * scale), 0.12 * scale, 0.76 * scale, trunk_mat, 8)

    if style == 0:
        sphere(f"{name}_leaf_a", (x, y, 1.0 * scale), 0.58 * scale, leaf_mat)
        sphere(f"{name}_leaf_b", (x - 0.25 * scale, y + 0.12 * scale, 0.86 * scale), 0.38 * scale, leaf_mat)
        sphere(f"{name}_leaf_c", (x + 0.26 * scale, y - 0.08 * scale, 0.9 * scale), 0.36 * scale, leaf_mat)
    else:
        cone(f"{name}_leaf_a", (x, y, 0.95 * scale), 0.62 * scale, 0.18 * scale, 0.82 * scale, leaf_mat, 8)
        cone(f"{name}_leaf_b", (x, y, 1.35 * scale), 0.48 * scale, 0.08 * scale, 0.62 * scale, leaf_mat, 8)


def lamp(name, x, y, mats):
    """创建路灯。"""
    cylinder(f"{name}_pole", (x, y, 0.68), 0.035, 1.28, mats["dark"], 10)
    cube(f"{name}_arm", (x + 0.22, y, 1.28), (0.45, 0.06, 0.06), mats["dark"], 0.02)
    sphere(f"{name}_light", (x + 0.46, y, 1.2), 0.13, mats["lamp"], 12)


def fence_segment(name, x, y, length, horizontal, mats):
    """创建围栏段。"""
    if horizontal:
        cube(f"{name}_rail_a", (x, y, 0.42), (length, 0.06, 0.08), mats["fence"], 0.02)
        cube(f"{name}_rail_b", (x, y, 0.72), (length, 0.06, 0.08), mats["fence"], 0.02)
        count = int(length / 1.15)
        start = x - length / 2
        for index in range(count + 1):
            cube(f"{name}_post_{index}", (start + index * 1.15, y, 0.43), (0.12, 0.12, 0.86), mats["fence"], 0.025)
    else:
        cube(f"{name}_rail_a", (x, y, 0.42), (0.06, length, 0.08), mats["fence"], 0.02)
        cube(f"{name}_rail_b", (x, y, 0.72), (0.06, length, 0.08), mats["fence"], 0.02)
        count = int(length / 1.15)
        start = y - length / 2
        for index in range(count + 1):
            cube(f"{name}_post_{index}", (x, start + index * 1.15, 0.43), (0.12, 0.12, 0.86), mats["fence"], 0.025)


def add_plaza(mats):
    """添加中心小广场。"""
    cylinder("center_plaza", (-1.0, 1.1, 0.115), 1.7, 0.06, mats["plaza"], 48)
    cylinder("plaza_ring", (-1.0, 1.1, 0.15), 1.15, 0.05, mats["road"], 40)
    sphere("plaza_sculpture", (-1.0, 1.1, 0.75), 0.28, mats["blue"], 12)


def add_camera_and_light():
    """添加预览相机和灯光，方便直接打开 blend 检查。"""
    bpy.ops.object.light_add(type="SUN", location=(-5, -6, 10))
    sun = bpy.context.object
    sun.name = "Campus Sun"
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(48), 0, math.radians(-34))

    bpy.ops.object.light_add(type="AREA", location=(0, -4, 7))
    area = bpy.context.object
    area.name = "Soft Fill"
    area.data.energy = 420
    area.data.size = 7

    bpy.ops.object.camera_add(location=(10, -13, 10), rotation=(math.radians(58), 0, math.radians(40)))
    camera = bpy.context.object
    camera.name = "Campus Camera"
    bpy.context.scene.camera = camera


def build_scene():
    """搭建完整园区场景。"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    clear_scene()

    mats = {
        "grass_side": material("grass_side", (0.36, 0.63, 0.32, 1)),
        "grass_top": material("grass_top", (0.62, 0.83, 0.45, 1)),
        "grass_light": material("grass_light", (0.73, 0.9, 0.58, 1)),
        "road": material("warm_road", (0.82, 0.78, 0.68, 1)),
        "plaza": material("plaza_stone", (0.88, 0.84, 0.76, 1)),
        "stone": material("stone_base", (0.92, 0.9, 0.82, 1)),
        "glass": material("soft_glass", (0.88, 0.98, 1.0, 1)),
        "white": material("road_mark_white", (0.96, 0.97, 0.92, 1)),
        "dark": material("dark_metal", (0.11, 0.16, 0.17, 1), 0.45),
        "fence": material("wood_fence", (0.73, 0.48, 0.27, 1)),
        "trunk": material("tree_trunk", (0.42, 0.25, 0.14, 1)),
        "leaf": material("leaf_green", (0.39, 0.68, 0.32, 1)),
        "leaf_light": material("leaf_light", (0.58, 0.76, 0.3, 1)),
        "leaf_pink": material("leaf_pink", (0.95, 0.55, 0.57, 1)),
        "parcel": material("parcel_box", (0.76, 0.5, 0.24, 1)),
        "blue": material("campus_blue", (0.32, 0.65, 0.9, 1)),
        "lamp": material("lamp_glow", (1.0, 0.85, 0.4, 1), emission=(1.0, 0.72, 0.2, 1), strength=1.2),
    }

    building_mats = {
        "dorm_body": material("dorm_body", (0.78, 0.86, 0.89, 1)),
        "dorm_roof": material("dorm_roof", (0.95, 0.42, 0.26, 1)),
        "service_body": material("service_body", (0.82, 0.89, 0.9, 1)),
        "service_roof": material("service_roof", (0.35, 0.72, 0.64, 1)),
        "express_body": material("express_body", (0.9, 0.78, 0.58, 1)),
        "express_roof": material("express_roof", (0.94, 0.58, 0.22, 1)),
        "ops_body": material("ops_body", (0.78, 0.88, 0.86, 1)),
        "ops_roof": material("ops_roof", (0.38, 0.65, 0.82, 1)),
        "door": material("door_dark", (0.33, 0.43, 0.45, 1)),
    }

    cube("campus_base", (0, 0, -0.28), (25.8, 19.6, 0.56), mats["grass_side"], 0.55)
    cube("campus_top", (0, 0, 0.04), (25.0, 18.8, 0.12), mats["grass_top"], 0.45)

    for x, y, sx, sy in [(-8.2, -7.4, 4.2, 2.9), (4.8, -7.9, 5.0, 2.7), (9.2, 5.1, 3.6, 4.2), (-7.2, 7.2, 5.0, 2.8)]:
        cube(f"grass_patch_{x}_{y}", (x, y, 0.13), (sx, sy, 0.045), mats["grass_light"], 0.35)

    road_segment("road_north", 0, -5.8, 20.2, 1.45, mats["road"])
    road_segment("road_east", 8.2, 0.2, 1.45, 14.2, mats["road"])
    road_segment("road_south", -0.6, 6.2, 17.7, 1.45, mats["road"])
    road_segment("road_west", -8.6, -0.2, 1.25, 11.1, mats["road"])

    for index, (x, y, radius) in enumerate([(8.2, -5.8, 1.1), (8.2, 6.2, 1.1), (-8.6, -5.8, 0.96), (-1.0, 1.1, 1.35)]):
        road_junction(f"junction_{index}", x, y, radius, mats["road"])

    building(
        {
            "name": "dorm",
            "x": -4.8,
            "y": -2.55,
            "width": 3.35,
            "depth": 2.2,
            "height": 1.65,
            "body": building_mats["dorm_body"],
            "roof": building_mats["dorm_roof"],
            "door": building_mats["door"],
        },
        mats,
    )
    building(
        {
            "name": "service",
            "x": 1.35,
            "y": -2.45,
            "width": 3.8,
            "depth": 2.45,
            "height": 1.95,
            "body": building_mats["service_body"],
            "roof": building_mats["service_roof"],
            "door": building_mats["door"],
        },
        mats,
    )
    building(
        {
            "name": "express_station",
            "x": 4.7,
            "y": 3.2,
            "width": 3.05,
            "depth": 2.15,
            "height": 1.3,
            "body": building_mats["express_body"],
            "roof": building_mats["express_roof"],
            "door": building_mats["door"],
        },
        mats,
    )
    building(
        {
            "name": "ops",
            "x": -3.65,
            "y": 3.25,
            "width": 2.85,
            "depth": 2.05,
            "height": 1.45,
            "body": building_mats["ops_body"],
            "roof": building_mats["ops_roof"],
            "door": building_mats["door"],
        },
        mats,
    )

    add_plaza(mats)

    tree_points = [
        (-10.6, -7.5, 1.05, "leaf"),
        (-8.6, -8.7, 1.12, "leaf_light"),
        (-6.2, -7.8, 0.98, "leaf_pink"),
        (-2.2, -8.7, 1.02, "leaf"),
        (3.8, -8.9, 1.08, "leaf_light"),
        (6.5, -8.2, 0.98, "leaf_pink"),
        (10.5, -7.3, 1.1, "leaf"),
        (11.3, 3.2, 1.02, "leaf_light"),
        (10.2, 6.9, 1.0, "leaf"),
        (6.5, 8.3, 1.1, "leaf_light"),
        (2.8, 8.6, 0.98, "leaf_pink"),
        (-1.0, 8.9, 1.03, "leaf_pink"),
        (-4.3, 8.4, 0.95, "leaf"),
        (-7.3, 8.0, 1.05, "leaf_light"),
        (-11.3, 4.7, 1.12, "leaf"),
        (-11.5, -1.5, 1.0, "leaf_pink"),
    ]
    for index, (x, y, scale, leaf_name) in enumerate(tree_points):
        tree(f"tree_{index}", x, y, scale, mats["trunk"], mats[leaf_name], index % 2)

    for index, (x, y) in enumerate([(-8.2, -3.5), (-3.0, 3.0), (2.0, -3.1), (8.4, 3.2), (8.4, -3.5)]):
        lamp(f"lamp_{index}", x, y, mats)

    fence_segment("fence_north", 0, -9.35, 23.0, True, mats)
    fence_segment("fence_south", 0, 9.35, 23.0, True, mats)
    fence_segment("fence_west", -12.55, 0, 16.6, False, mats)
    fence_segment("fence_east", 12.55, 0, 16.6, False, mats)

    add_camera_and_light()

    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.world.color = (0.78, 0.9, 1.0)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_apply=True,
        export_lights=False,
        export_cameras=False,
    )


if __name__ == "__main__":
    build_scene()
