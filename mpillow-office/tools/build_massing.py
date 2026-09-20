"""
Build the dimensioned massing model of the Mpillow showroom.

This is the "floor plan -> 3D" step. No image-to-3D model can do it (they all
reconstruct single objects, not rooms), so the geometry is computed: every
dimension in DIMS comes from the brief, every position in the ZONES section is
read off the page-4 plan (ref-img/floorplan/plan-p4-300dpi.png).

Axes while authoring: X = length (0 = west / entry wall), Y = up, Z = width
(0 = south / box store wall), metres -- i.e. the plan as drawn, north up. On
export Z is mirrored (z' = W - z) so the GLB is right-handed with X east and
Z south, which is what every Y-up viewer (ComfyUI Load3D, three.js) expects.

    python tools/build_massing.py

Writes model/showroom_massing.glb (+ .obj) and copies the GLB into
ComfyUI/input/3d/ so the Load3D node in the workflow can open it.
"""

import math
import os
import shutil

import numpy as np
import trimesh

COMFY_3D = r"D:\AI\ComfyUI\input\3d"

# --------------------------------------------------------------------------
# DIMENSIONS -- from the brief, pages 3-6
# --------------------------------------------------------------------------
DIMS = dict(
    overall_len=17.75,      # as-built overall
    width=7.90,
    ceiling=3.40,           # floor to ceiling clear
    main_floor_len=10.45,   # to the pantry line
    patio_len=4.55,
    # store strip through the workshop = 0.80 rack + 0.76 aisle + 0.44 shelf
    shelf_depth=0.44,
    aisle=0.76,
    rack_depth=0.80,
    rack_bay=1.70,          # 5 bays, 1.70 m beams on 0.80 m frames
    rack_levels=3,
    rack_pitch=0.95,
    box=0.78,
    inv_bay_w=0.95,
    backlit_top=2.80,
    sign_band=(2.85, 3.40),
    workbench_len=7.20,
    workbench_h=0.90,
    workbench_d=0.60,
    sewing_len=2.75,
    sewing_h=0.75,
    bed_w=1.07,             # super single
    bed_l=1.90,
    bed_h=0.45,
    photo_w=1.40,
    photo_l=1.80,
    feature_wall=2.10,
    door_w=1.80,            # double door
    door_recess=0.70,
    door_h=2.40,
    walk_in=0.95,           # opening in the inventory wall
    wall_t=0.15,
    store_a=(1.82, 2.60),
    store_b=(1.40, 2.60),
    store_c=(4.42, 1.16),
)
D = DIMS

SERVICE_BAND = D["overall_len"] - D["main_floor_len"] - D["patio_len"]  # 2.75
X_PANTRY = D["main_floor_len"]          # 10.45
X_PATIO = X_PANTRY + SERVICE_BAND       # 13.20

# --------------------------------------------------------------------------
# ZONES -- positions read off the page-4 plan.
# West wall, north to south: 2.80 (door + fitting bays) / 2.08 (seats) /
# 0.96 (bench) / 0.44 (shelf) / 1.00 (aisle) / 0.62 (box row) = 7.90.
# --------------------------------------------------------------------------
Z_RACK = (0.0, D["rack_depth"])                         # 0.00 - 0.80
Z_AISLE = (Z_RACK[1], Z_RACK[1] + D["aisle"])           # 0.80 - 1.56
Z_INV = (Z_AISLE[1], Z_AISLE[1] + D["shelf_depth"])     # 1.56 - 2.00
Z_BENCH = (2.05, 2.05 + D["workbench_d"])               # 2.05 - 2.65

X_WEST_BAY = (0.15, 1.85)           # one rack bay + two shelf bays west of the walk-in
X_WALK_IN = (1.85, 2.80)            # walk-in through the inventory wall
X_STRIP = 2.80                      # main run starts here
X_BENCH = 2.90
DOOR_Z = (5.15, 5.15 + D["door_w"])                     # 5.15 - 6.95, NW corner
SEATS = (0.15, 2.20, 0.85, 4.90)                        # x0 z0 x1 z1, along the west wall
FEATURE_X = 3.10                                        # N-S panel next to the door
BED_X = (4.55, 7.10)                                    # bed 1, bed 2 west edges
BED_Z = (5.55, 5.55 + D["bed_l"])                       # 5.55 - 7.45
TRACK = (6.05, 6.45, 2.75, 1.35)                        # ellipse cx cz rx rz
PHOTO_X = 8.95
PANTRY_X = (X_PANTRY, 11.30)
WC_X = (11.30, 12.85)
AC_X = (12.85, 13.75)
NORTH_ROOMS_Z = 5.75                                    # pantry / WC / A/C ledge front
WORK_TABLE = (12.30, 2.70, 13.10, 5.20)
GLASS_DOOR_Z = (1.35, 2.70)
COLUMNS_X = ((2.30, 2.80), (9.60, 10.10), (13.15, 13.65))

PALETTE = {
    "shell": (196, 193, 188),
    "floor": (176, 173, 168),
    "joinery": (205, 178, 133),     # pale ash / oak
    "rack": (120, 124, 130),        # steel
    "soft": (150, 152, 160),        # beds, seating
    "glass": (150, 190, 205),
    "accent": (196, 150, 90),       # signage band, backlit panels
    "service": (168, 166, 162),
    "patio": (140, 142, 145),
}

parts = {}


def _paint(m, color):
    rgba = np.array(list(color) + [255], np.uint8)
    m.visual.face_colors = np.tile(rgba, (len(m.faces), 1))
    return m


def add(name, x0, z0, x1, z1, y0, y1, color):
    """Axis-aligned box from a plan footprint plus a height range."""
    ex, ey, ez = abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)
    if min(ex, ey, ez) <= 0:
        raise ValueError("degenerate box: " + name)
    m = trimesh.creation.box(extents=(ex, ey, ez))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    parts[name] = _paint(m, color)


def add_segment(name, p0, p1, y0, y1, t, color):
    """Thin bar between two plan points, rotated about Y."""
    (x0, z0), (x1, z1) = p0, p1
    length = math.hypot(x1 - x0, z1 - z0)
    m = trimesh.creation.box(extents=(length, y1 - y0, t))
    ang = math.atan2(-(z1 - z0), (x1 - x0))
    m.apply_transform(trimesh.transformations.rotation_matrix(ang, (0, 1, 0)))
    m.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    parts[name] = _paint(m, color)


L, W, H, T = D["overall_len"], D["width"], D["ceiling"], D["wall_t"]

# ---- shell ---------------------------------------------------------------
add("floor", 0, 0, L, W, -0.12, 0.0, PALETTE["floor"])
add("wall_south", 0, -T, X_PATIO, 0, 0, H, PALETTE["shell"])
add("wall_north", 0, W, X_PATIO, W + T, 0, H, PALETTE["shell"])

# West wall in three pieces around the recessed double door (NW corner).
add("wall_west_s", -T, 0, 0, DOOR_Z[0], 0, H, PALETTE["shell"])
add("wall_west_n", -T, DOOR_Z[1], 0, W, 0, H, PALETTE["shell"])
add("wall_west_head", -T, DOOR_Z[0], 0, DOOR_Z[1], D["door_h"], H, PALETTE["shell"])
add("recess_s", 0, DOOR_Z[0] - T, D["door_recess"], DOOR_Z[0], 0, H, PALETTE["shell"])
add("recess_n", 0, DOOR_Z[1], D["door_recess"], DOOR_Z[1] + T, 0, H, PALETTE["shell"])
add("door_leaf", D["door_recess"] - 0.06, DOOR_Z[0], D["door_recess"],
    DOOR_Z[1], 0, D["door_h"], PALETTE["glass"])

# Structural columns on the north and south walls.
for i, (cx0, cx1) in enumerate(COLUMNS_X):
    add("col_s_%d" % i, cx0, 0, cx1, 0.35, 0, H, PALETTE["shell"])
    add("col_n_%d" % i, cx0, W - 0.35, cx1, W, 0, H, PALETTE["shell"])

# ---- box store (south strip) --------------------------------------------
# 5 bays x 1.70 m: one west of the walk-in, four in the main run.
bays = [(X_WEST_BAY[0], X_WEST_BAY[0] + D["rack_bay"])]
for b in range(4):
    bays.append((X_STRIP + b * D["rack_bay"], X_STRIP + (b + 1) * D["rack_bay"]))

for bi, (bx0, bx1) in enumerate(bays):
    for lvl in range(D["rack_levels"]):
        y = 0.05 + lvl * D["rack_pitch"]
        add("rack_deck_%d_%d" % (bi, lvl), bx0, Z_RACK[0], bx1, Z_RACK[1],
            y, y + 0.04, PALETTE["rack"])
    for side, x in (("a", bx0), ("b", bx1 - 0.06)):
        add("rack_post_%d%s" % (bi, side), x, Z_RACK[0], x + 0.06, Z_RACK[1],
            0, 2.85, PALETTE["rack"])

slot = 0
for bi, (bx0, bx1) in enumerate(bays):
    for lvl in range(D["rack_levels"]):
        y = 0.09 + lvl * D["rack_pitch"]
        for k in range(2):
            slot += 1
            if slot == 15:                          # the cleared position -> 29 boxes
                continue
            x = bx0 + 0.07 + k * (D["box"] + 0.05)
            add("box_%02d" % slot, x, 0.01, x + D["box"], 0.79, y, y + D["box"],
                PALETTE["joinery"])

# ---- inventory wall (customer face of the store) -------------------------
inv_x1 = X_PANTRY - 0.05
add("inv_wall_w", X_WEST_BAY[0], Z_INV[0], X_WALK_IN[0], Z_INV[1], 0, H, PALETTE["joinery"])
add("inv_wall_head", X_WALK_IN[0], Z_INV[0], X_WALK_IN[1], Z_INV[1], 2.10, H, PALETTE["joinery"])
add("inv_wall_e", X_STRIP, Z_INV[0], inv_x1, Z_INV[1], 0, H, PALETTE["joinery"])
add("backlit_panel", X_STRIP, Z_INV[1], inv_x1, Z_INV[1] + 0.04, 1.10, D["backlit_top"], PALETTE["accent"])
add("sign_band", X_STRIP, Z_INV[1], inv_x1, Z_INV[1] + 0.06,
    D["sign_band"][0], D["sign_band"][1], PALETTE["accent"])
n_bays = int(round((inv_x1 - X_STRIP) / D["inv_bay_w"]))
for b in range(n_bays + 1):
    x = X_STRIP + b * (inv_x1 - X_STRIP) / n_bays
    add("inv_fin_%d" % b, x - 0.02, Z_INV[0], x + 0.02, Z_INV[1] + 0.10, 0, H, PALETTE["shell"])
add("inv_fin_w", X_WEST_BAY[0] + (X_WALK_IN[0] - X_WEST_BAY[0]) / 2 - 0.02, Z_INV[0],
    X_WEST_BAY[0] + (X_WALK_IN[0] - X_WEST_BAY[0]) / 2 + 0.02, Z_INV[1] + 0.10, 0, H, PALETTE["shell"])

# ---- workshop ------------------------------------------------------------
bx1 = X_BENCH + D["workbench_len"]
add("workbench", X_BENCH, Z_BENCH[0], bx1, Z_BENCH[1], 0, D["workbench_h"], PALETTE["joinery"])
add("workbench_top", X_BENCH - 0.05, Z_BENCH[0] - 0.05, bx1 + 0.05, Z_BENCH[1] + 0.05,
    D["workbench_h"], D["workbench_h"] + 0.05, PALETTE["joinery"])
add("light_panel", X_BENCH, Z_BENCH[0] - 0.10, bx1, Z_BENCH[1] + 0.10,
    H - 0.30, H - 0.26, PALETTE["accent"])
# sewing table sits in the service band against the south wall
add("sewing_table", X_PANTRY + 0.05, 0.10, X_PANTRY + 0.05 + D["sewing_len"], 0.65,
    0, D["sewing_h"], PALETTE["joinery"])

# ---- entry + waiting -----------------------------------------------------
add("seat_bench", SEATS[0], SEATS[1], SEATS[2], SEATS[3], 0, 0.42, PALETTE["soft"])
add("rug", 0.95, 2.30, 2.60, 4.80, 0.0, 0.02, PALETTE["soft"])
add("feature_wall", FEATURE_X, W - 0.05 - D["feature_wall"], FEATURE_X + 0.15, W - 0.05,
    0, 2.40, PALETTE["joinery"])

# ---- fitting bays --------------------------------------------------------
for i, x0 in enumerate(BED_X):
    add("bed_%d" % i, x0, BED_Z[0], x0 + D["bed_w"], BED_Z[1], 0.12, D["bed_h"], PALETTE["soft"])
    add("pillow_%d" % i, x0 + 0.12, BED_Z[1] - 0.55, x0 + D["bed_w"] - 0.12, BED_Z[1] - 0.10,
        D["bed_h"], D["bed_h"] + 0.14, PALETTE["soft"])
    add("cove_%d" % i, x0 + 0.10, BED_Z[0] + 0.10, x0 + D["bed_w"] - 0.10, BED_Z[1] - 0.10,
        0.0, 0.12, PALETTE["accent"])

# one oval curtain track around both beds, plus a divider between them
cx, cz, rx, rz = TRACK
pts = [(cx + rx * math.cos(2 * math.pi * k / 40), cz + rz * math.sin(2 * math.pi * k / 40))
       for k in range(40)]
for k in range(40):
    add_segment("track_%02d" % k, pts[k], pts[(k + 1) % 40], H - 0.10, H - 0.05, 0.05, PALETTE["rack"])
add("track_divider", cx + 0.25, cz - rz, cx + 0.30, cz + rz, H - 0.10, H - 0.05, PALETTE["rack"])

# photo station: floor mat + camera positions front and back
add("photo_floor", PHOTO_X, W - 0.20 - D["photo_l"], PHOTO_X + D["photo_w"], W - 0.20,
    0.0, 0.03, PALETTE["accent"])
add("photo_cam_a", PHOTO_X + 0.62, W - 0.24 - D["photo_l"], PHOTO_X + 0.78,
    W - 0.16 - D["photo_l"], 1.30, 1.55, PALETTE["rack"])
add("photo_cam_b", PHOTO_X + 0.62, W - 0.24, PHOTO_X + 0.78, W - 0.16, 1.30, 1.55, PALETTE["rack"])

# ---- service band: pantry, WC, A/C ledge, work table --------------------
zf = NORTH_ROOMS_Z
add("north_rooms_front", PANTRY_X[0], zf - T, WC_X[1], zf, 0, H, PALETTE["shell"])
add("pantry_wall_e", PANTRY_X[1] - T, zf, PANTRY_X[1], W, 0, H, PALETTE["shell"])
add("wc_wall_e", WC_X[1] - T, zf, WC_X[1], W, 0, H, PALETTE["shell"])
add("pantry_counter", PANTRY_X[1] - T - 0.30, zf + 0.10, PANTRY_X[1] - T, W - 0.10,
    0, 0.90, PALETTE["joinery"])
add("wc_fixtures", WC_X[0] + 0.10, W - 0.80, WC_X[1] - T - 0.10, W - 0.10, 0, 0.90, PALETTE["service"])
add("ac_ledge", AC_X[0], zf, AC_X[1], W, 0, 0.60, PALETTE["patio"])
add("work_table", WORK_TABLE[0], WORK_TABLE[1], WORK_TABLE[2], WORK_TABLE[3], 0, 0.75, PALETTE["joinery"])

# patio line: glazing with the glass door, solid head above
gd0, gd1 = GLASS_DOOR_Z
add("patio_glazing_s", X_PATIO - 0.06, 0, X_PATIO, gd0, 0, 2.55, PALETTE["glass"])
add("glass_door", X_PATIO - 0.05, gd0, X_PATIO, gd1, 0, 2.40, PALETTE["glass"])
add("patio_glazing_n", X_PATIO - 0.06, gd1, X_PATIO, zf, 0, 2.55, PALETTE["glass"])
add("patio_head", X_PATIO - T, 0, X_PATIO, zf, 2.55, H, PALETTE["shell"])

# ---- patio ---------------------------------------------------------------
add("patio_deck", X_PATIO, 0, L, W, -0.06, 0.0, PALETTE["patio"])
add("patio_parapet_s", X_PATIO, -T, L, 0, 0, 1.10, PALETTE["shell"])
add("ziptrack_s", X_PATIO, -0.08, L, -0.02, 1.10, 2.55, PALETTE["glass"])
add("patio_parapet_e", L, 0, L + T, W, 0, 1.10, PALETTE["shell"])
add("patio_wall_n", AC_X[1], W, L, W + T, 0, 2.60, PALETTE["shell"])
sa, sb, sc = D["store_a"], D["store_b"], D["store_c"]
add("store_a", X_PATIO + 0.10, 3.00, X_PATIO + 0.10 + sa[0], 3.00 + sa[1], 0, 2.20, PALETTE["service"])
add("store_b", L - sb[0], 3.00, L, 3.00 + sb[1], 0, 2.20, PALETTE["service"])
add("store_c", L - sc[0], 0.10, L, 0.10 + sc[1], 0, 2.20, PALETTE["service"])
for k in range(3):
    add("drying_rack_%d" % k, X_PATIO + 0.90, W - 0.20, L - 0.45, W - 0.14,
        1.40 + 0.30 * k, 1.46 + 0.30 * k, PALETTE["rack"])
# poly roof from the door head over the whole patio, open over the A/C bay
add("poly_roof", X_PATIO, 0, L, zf, 2.55, 2.62, PALETTE["glass"])
add("poly_roof_n", AC_X[1], zf, L, W, 2.55, 2.62, PALETTE["glass"])

# ---- export --------------------------------------------------------------
# Mirror Z so the model is right-handed (X east, Y up, Z south). trimesh
# re-orients the faces itself when a transform has a negative determinant.
MIRROR = np.diag([1.0, 1.0, -1.0, 1.0])
MIRROR[2, 3] = W
for mesh in parts.values():
    mesh.apply_transform(MIRROR)
    assert mesh.volume > 0, "inverted winding: " + str(mesh)

scene = trimesh.Scene()
for name, mesh in parts.items():
    scene.add_geometry(mesh, geom_name=name, node_name=name)

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_dir = os.path.join(root, "model")
os.makedirs(out_dir, exist_ok=True)

glb = os.path.join(out_dir, "showroom_massing.glb")
scene.export(glb)

merged = trimesh.util.concatenate(list(parts.values()))
obj = os.path.join(out_dir, "showroom_massing.obj")
merged.export(obj)

if os.path.isdir(COMFY_3D):
    shutil.copy(glb, os.path.join(COMFY_3D, os.path.basename(glb)))

print("parts:   %d" % len(parts))
print("extents: %s  (X len, Y height, Z width)" % merged.extents.round(2))
print("centre:  %s" % merged.bounds.mean(axis=0).round(2))
print("glb:     %s  (%s bytes)" % (glb, format(os.path.getsize(glb), ",")))
print("obj:     %s  (%s bytes)" % (obj, format(os.path.getsize(obj), ",")))
