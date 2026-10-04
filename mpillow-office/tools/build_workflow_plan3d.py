"""
Generate the standalone FLOOR PLAN -> 3D workflow: any plan image in, a
clean metric GLB + its zone ID twin out, and every render pass the showroom
renders are locked to -- for a free camera and six fixed ones.

  1  PLAN -> 3D      Load Image (paint missed walls in its mask editor) ->
                     Floor Plan -> 3D (comfy_nodes/mp_plan3d): GLB, ID GLB,
                     "understood" picture, report, six framing cameras.
  2  FREE CAMERA     the showroom's 5.13 chain, fed by the new GLBs:
                     HIDE PARTS -> two GLB Part Filters -> Preview 3D
                     (Advanced) as the camera -> Render Mesh depth / normal
                     / ID -> the six zone masks.
  3  FIXED CAMERAS   iso_se / iso_sw / iso_ne / iso_nw / top / eye_level,
                     framed from the model's size: depth, normal, ID each.

Every pass is saved to output/plan3d/passes/. 16:9, 1664 x 928.

    python tools/build_workflow_plan3d.py    # -> workflows/floorplan_to_3d_16x9.json
"""

import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "workflows", "floorplan_to_3d_16x9.json")
SIDEBAR = r"D:\AI\ComfyUI\user\default\workflows\mpillow-office"
COMFY_INPUT = r"D:\AI\ComfyUI\input"

PLAN_SRC = os.path.join(ROOT, "ref-img", "floorplan", "plan-p4-300dpi.png")
PLAN_FILE = "mpillow_plan-p4.png"          # copied into ComfyUI/input for Load Image
PLAN_WIDTH = 17.75                          # the showroom; set yours on the canvas
WALL_H = 3.40
ROOM_MODEL = "raster2seq\\cubicasa5k.pth"  # ComfyUI lists sub-folder models with the OS separator
W, H = 1664, 928
HIDE = "ceiling\next_south*        # cutaway: the facade nearest the iso cameras"
CAMERAS = ["iso_se", "iso_sw", "iso_ne", "iso_nw", "top", "eye_level"]
PASSES = [("depth", "depth", "beauty"), ("normal", "normal", "beauty"), ("id", "vertex colors", "ids")]
ZONES = ["red", "green", "blue", "yellow", "magenta", "cyan"]

README = (
    "# Floor plan -> 3D -> render passes\n\n"
    "**Any plan image in; a clean, metric GLB and every pass the renders\n"
    "need out.** Nothing here spends credits; both recognisers are local\n"
    "models.\n\n"
    "**How it reads the plan.** Image-to-3D models (TRELLIS, Hunyuan3D,\n"
    "Tripo) rebuild single objects as blobby, unscaled meshes; they cannot\n"
    "read a plan. So this goes plan -> vector walls -> exact extrusion:\n\n"
    "1. a CubiCasa5K segmenter marks **wall / door / window** pixels and\n"
    "   ignores furniture, text and dimension lines (`recogniser = cv` is a\n"
    "   model-free fallback for clean CAD exports);\n"
    "   **Raster2Seq** (SIGGRAPH '26, `room_model`) reads the **rooms**:\n"
    "   they become the zones, and where two rooms meet with a solid\n"
    "   straight line drawn between them but no wall found, that line\n"
    "   becomes a partition (WC / storage hairlines). Dotted curtain\n"
    "   tracks, text and furniture are skipped. `room_walls` off = rooms\n"
    "   as zones only; `room_model = none` = walls only, as before;\n"
    "2. walls are vectorised and **snapped to the plan axes**, so they come\n"
    "   out as crisp prisms (~2k triangles for the whole showroom);\n"
    "3. door gaps get a lintel, window gaps a sill and a lintel, each zone\n"
    "   a floor slab; exterior walls are split by side (`ext_north` ..\n"
    "   `ext_west`, lintels too), so `ext_south*` in HIDE PARTS is a cutaway;\n"
    "4. an **ID twin** paints every part in its zone colour (red, green,\n"
    "   blue, yellow, magenta, cyan) for the regional-prompt masks.\n\n"
    "**Your steps.**\n"
    "1. Load your plan in 1.1 (north up). Set `plan_width_m` to the real\n"
    "   west-east outer width (the overall dimension) and `wall_height`.\n"
    "2. Run. Check **1.3 understood**: walls black, door gaps orange,\n"
    "   window gaps blue, zones tinted.\n"
    "3. Missed a partition? Right-click the plan in 1.1 -> *Open in\n"
    "   MaskEditor*, paint over it, save, Run: the mask is wired to\n"
    "   `add_walls`. Something read as a wall that is not (racks, a\n"
    "   heavy bench)? Paint it on a copy loaded in 1.2 and wire that mask\n"
    "   to `erase`.\n"
    "4. Zones are the rooms Raster2Seq read (largest first: red, green,\n"
    "   blue, yellow, magenta, cyan; the rest white), named in the report.\n"
    "   For your own functional zones, paint a plan-sized image with flat\n"
    "   red / green / ... regions, load it in 1.2, wire IMAGE -> `zone_map`:\n"
    "   it overrides the rooms. An added partition you do not want: paint\n"
    "   it into `erase`, or switch `room_walls` off.\n\n"
    "GLBs land in `output/plan3d/` (`plan_3d.glb`, `plan_3d_ids.glb`);\n"
    "passes in `output/plan3d/passes/`. Built with\n"
    "`python tools/build_workflow_plan3d.py`."
)

FREE_NOTE = (
    "## 2  Free camera\n\n"
    "Same chain as the showroom's 5.13. **HIDE PARTS** lists the parts to\n"
    "leave out (one per line, `*` `?` wildcards, `#` comment); it drives\n"
    "both GLB Part Filters, so depth and zone masks always agree. The\n"
    "report (1.4) and `part names in the model` list what you can name:\n"
    "`ext_north` .. `ext_west` (+ `_door_lintels`, `_window_lintels`,\n"
    "`_window_sills`), `walls_interior`, `door_lintels`, `floor_z<n>`,\n"
    "`ceiling`.\n\n"
    "Orbit / pan / zoom the **Preview 3D (Advanced)** viewer, press Run:\n"
    "its camera bakes depth, normal and ID at 1664 x 928. Prefer numbers?\n"
    "Wire `camera by numbers` (target = the centre in the report) to\n"
    "camera_info on all three Render Mesh nodes.\n\n"
    "The six zone masks come from the ID pass by channel thresholds\n"
    "(red = R - G - B, yellow = R x G - B, ...), exactly as in the zoned\n"
    "showroom workflow: drop them into ConditioningSetMask."
)

FIXED_NOTE = (
    "## 3  Fixed cameras\n\n"
    "Six cameras the plan node frames from the model's size: four\n"
    "isometrics at 35 degrees, a near-vertical top view and an eye-level\n"
    "view from the west end looking east. They see the same HIDE PARTS\n"
    "list as the free camera. Each saves depth, normal and ID to\n"
    "`output/plan3d/passes/<camera>_<pass>`."
)


def node(nid, ntype, pos, size, widgets=None, inputs=None, outputs=None, title=None, mode=0):
    n = {"id": nid, "type": ntype, "pos": list(pos), "size": list(size), "flags": {}, "order": 0,
         "mode": mode, "inputs": inputs or [], "outputs": outputs or [],
         "properties": {"Node name for S&R": ntype}}
    if widgets is not None:
        n["widgets_values"] = widgets
    if title:
        n["title"] = title
    return n


def inp(name, typ, widget=False, optional=False):
    d = {"name": name, "type": typ, "link": None}
    if widget:
        d["widget"] = {"name": name}
    if optional:
        d["shape"] = 7
    return d


def out(name, typ):
    return {"name": name, "type": typ, "links": []}


def main():
    nodes, links, groups = [], [], []
    lid = [0]

    def link(src, sslot, dst, dslot, typ):
        lid[0] += 1
        links.append([lid[0], src, sslot, dst, dslot, typ])

    def group(title, x, y, w, h, color):
        groups.append({"id": len(groups) + 1, "title": title, "bounding": [x, y, w, h],
                       "color": color, "font_size": 24, "flags": {}})

    def preview(nid, pos, src, slot=0, title="preview", size=(420, 300)):
        nodes.append(node(nid, "PreviewImage", pos, size, [], inputs=[inp("images", "IMAGE")], title=title))
        link(src, slot, nid, 0, "IMAGE")

    def render(nid, pos, mesh_src, mode, title):
        nodes.append(node(nid, "RenderMesh", pos, (300, 200), [mode, W, H, "#000000"],
                          inputs=[inp("mesh", "MESH"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                                  inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                          outputs=[out("image", "IMAGE"), out("mask", "MASK")], title=title))
        link(mesh_src, 0, nid, 0, "MESH")

    def save(nid, pos, src, prefix, title=None, size=(300, 260)):
        nodes.append(node(nid, "SaveImage", pos, size, [prefix], inputs=[inp("images", "IMAGE")],
                          title=title or prefix))
        link(src, 0, nid, 0, "IMAGE")

    nodes.append(node(1, "MarkdownNote", (0, -700), (1160, 660), [README], title="READ ME"))

    # ========================== 1  PLAN -> 3D ==============================
    X1, Y1 = 0, 0
    nodes.append(node(10, "LoadImage", (X1 + 20, Y1 + 60), (520, 560), [PLAN_FILE, "image"],
                      outputs=[out("IMAGE", "IMAGE"), out("MASK", "MASK")],
                      title="1.1  FLOOR PLAN  (north up; paint missed walls in its mask editor)"))
    nodes.append(node(11, "LoadImage", (X1 + 20, Y1 + 660), (520, 420), [PLAN_FILE, "image"],
                      outputs=[out("IMAGE", "IMAGE"), out("MASK", "MASK")], mode=2,
                      title="1.2  OPTIONAL  zone map / erase mask  (un-mute, wire IMAGE -> zone_map or MASK -> erase)"))
    plan_in = [inp("plan", "IMAGE")]
    plan_in += [inp(n, t, widget=True) for n, t in (
        ("plan_width_m", "FLOAT"), ("wall_height", "FLOAT"), ("door_height", "FLOAT"),
        ("sill_height", "FLOAT"), ("recogniser", "COMBO"), ("seg_model", "COMBO"), ("room_model", "COMBO"),
        ("room_walls", "BOOLEAN"), ("ceiling", "BOOLEAN"),
        ("snap_deg", "FLOAT"), ("max_opening_m", "FLOAT"), ("min_room_m2", "FLOAT"),
        ("filename_prefix", "STRING"))]
    plan_in += [inp("add_walls", "MASK", optional=True), inp("erase", "MASK", optional=True),
                inp("zone_map", "IMAGE", optional=True)]
    nodes.append(node(12, "MPFloorPlanTo3D", (X1 + 580, Y1 + 60), (380, 560),
                      [PLAN_WIDTH, WALL_H, 2.1, 0.9, "model", "floorplan-to-3d-walls.safetensors",
                       ROOM_MODEL, True, True,
                       6.0, 2.2, 1.0, "plan3d/plan"],
                      inputs=plan_in,
                      outputs=[out("model_3d", "FILE_3D"), out("id_model_3d", "FILE_3D"),
                               out("understood", "IMAGE"), out("report", "STRING")]
                      + [out(c, "LOAD3D_CAMERA") for c in CAMERAS],
                      title="1.2  FLOOR PLAN -> 3D  (set plan_width_m = real outer width, west-east)"))
    link(10, 0, 12, 0, "IMAGE")
    link(10, 1, 12, [i["name"] for i in plan_in].index("add_walls"), "MASK")   # painted mask -> add_walls
    preview(13, (X1 + 1000, Y1 + 60), 12, 2, "1.3  understood  --  walls black, doors orange, windows blue, zones tinted",
            (760, 520))
    nodes.append(node(14, "PreviewAny", (X1 + 580, Y1 + 620), (1180, 460), [],
                      inputs=[inp("source", "*")], title="1.4  report  --  scale, size, centre, zones, parts"))
    link(12, 3, 14, 0, "STRING")
    group("1  PLAN -> 3D  (any floor plan image -> clean metric GLB + zone ID twin)", X1, Y1, 1800, 1120, "#2f4858")

    # ========================= 2  FREE CAMERA ==============================
    X2, Y2 = 0, 1180
    nodes.append(node(20, "PrimitiveStringMultiline", (X2 + 20, Y2 + 60), (520, 170), [HIDE],
                      outputs=[out("STRING", "STRING")],
                      title="2.1  HIDE PARTS  --  one per line, * ? wildcards, # comment  (both models)"))
    filt_in = [inp("parts", "STRING", widget=True), inp("model_3d", "FILE_3D", optional=True)]
    filt_out = [out("model_3d", "FILE_3D"), out("all_parts", "STRING"), out("affected", "STRING"),
                out("visible_count", "INT")]
    for nid, y, src_slot, title in ((21, 270, 0, "2.2  model, parts hidden"), (22, 1000, 1, "2.2  ID model, same parts hidden")):
        nodes.append(node(nid, "MPGLBPartFilter", (X2 + 20, Y2 + y), (520, 150), ["none", HIDE, "hide"],
                          inputs=[dict(i) for i in filt_in], outputs=[dict(o, links=[]) for o in filt_out],
                          title=title))
        link(20, 0, nid, 0, "STRING")
        link(12, src_slot, nid, 1, "FILE_3D")
    nodes.append(node(23, "Preview3DAdvanced", (X2 + 20, Y2 + 440), (520, 520), [{}, W, H],
                      inputs=[inp("model_3d", "FILE_3D"), inp("model_3d_info", "LOAD3D_MODEL_INFO", optional=True),
                              inp("camera_info", "LOAD3D_CAMERA", optional=True)],
                      outputs=[out("model_3d", "FILE_3D"), out("model_3d_info", "LOAD3D_MODEL_INFO"),
                               out("camera_info", "LOAD3D_CAMERA"), out("width", "INT"), out("height", "INT")],
                      title="2.3  FREE CAMERA  --  orbit / pan / zoom here, then Run"))
    link(21, 0, 23, 0, "FILE_3D")
    for nid, src, y in ((24, 23, 60), (25, 22, 700)):
        nodes.append(node(nid, "Get3DComponents", (X2 + 580, Y2 + y), (300, 60), [],
                          inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")]))
        link(src, 0, nid, 0, "FILE_3D")
    free = {}
    for k, (pname, mode, which) in enumerate(PASSES):
        rid = 30 + k
        y = Y2 + 160 + k * 300 if which == "beauty" else Y2 + 800
        render(rid, (X2 + 580, y), 24 if which == "beauty" else 25, mode, "%s pass  (live, this camera)" % pname)
        link(23, 1, rid, 1, "LOAD3D_MODEL_INFO")
        link(23, 2, rid, 2, "LOAD3D_CAMERA")
        save(40 + k, (X2 + 920, y if which == "beauty" else Y2 + 800), rid, "plan3d/passes/free_%s" % pname,
             "2.4  %s  (free camera)" % pname, (420, 280))
        free[pname] = rid
    nodes.append(node(26, "PreviewAny", (X2 + 1380, Y2 + 60), (380, 360), [],
                      inputs=[inp("source", "*")], title="part names in the model  --  what HIDE PARTS can name"))
    link(21, 1, 26, 0, "STRING")
    nodes.append(node(27, "PreviewAny", (X2 + 1380, Y2 + 440), (380, 160), [],
                      inputs=[inp("source", "*")], title="hidden now"))
    link(21, 2, 27, 0, "STRING")
    nodes.append(node(28, "CreateCameraInfo", (X2 + 1380, Y2 + 630), (380, 260),
                      ["orbit", 135.0, 30.0, 24.0, PLAN_WIDTH / 2, WALL_H / 2, 4.0, 0.0, 35.0, 1.0, "perspective"],
                      outputs=[out("camera_info", "LOAD3D_CAMERA")],
                      title="camera by numbers  (alternative: wire to camera_info on the three Render Mesh)"))

    # zone masks from the free-camera ID pass
    MX, MY = X2 + 1800, Y2 + 60
    chan = {}
    for c, name in enumerate(("red", "green", "blue")):
        nodes.append(node(50 + c, "ImageToMask", (MX, MY + c * 130), (240, 60), [name],
                          inputs=[inp("image", "IMAGE")], outputs=[out("MASK", "MASK")], title="%s channel" % name))
        nodes.append(node(53 + c, "ThresholdMask", (MX, MY + 60 + c * 130), (240, 60), [0.5],
                          inputs=[inp("mask", "MASK")], outputs=[out("MASK", "MASK")], title="%s > 0.5" % name[0].upper()))
        link(free["id"], 0, 50 + c, 0, "IMAGE")
        link(50 + c, 0, 53 + c, 0, "MASK")
        chan[name[0].upper()] = 53 + c
    recipe = [("R", "subtract", "G", "B"), ("G", "subtract", "R", "B"), ("B", "subtract", "R", "G"),
              ("R", "multiply", "G", "B"), ("R", "multiply", "B", "G"), ("G", "multiply", "B", "R")]
    prev = None
    for k, (a, op, b, c) in enumerate(recipe):
        n1, n2, img, bat = 60 + k, 70 + k, 80 + k, 90 + k
        y = MY + k * 140
        nodes.append(node(n1, "MaskComposite", (MX + 280, y), (260, 130), [0, 0, op],
                          inputs=[inp("destination", "MASK"), inp("source", "MASK")],
                          outputs=[out("MASK", "MASK")], title="%s %s %s" % (a, op, b)))
        nodes.append(node(n2, "MaskComposite", (MX + 580, y), (260, 130), [0, 0, "subtract"],
                          inputs=[inp("destination", "MASK"), inp("source", "MASK")],
                          outputs=[out("MASK", "MASK")], title="- %s  =  %s  =  zone %d" % (c, ZONES[k], k)))
        link(chan[a], 0, n1, 0, "MASK")
        link(chan[b], 0, n1, 1, "MASK")
        link(n1, 0, n2, 0, "MASK")
        link(chan[c], 0, n2, 1, "MASK")
        nodes.append(node(img, "MaskToImage", (MX + 880, y), (220, 60), [],
                          inputs=[inp("mask", "MASK")], outputs=[out("IMAGE", "IMAGE")]))
        link(n2, 0, img, 0, "MASK")
        if prev is None:
            prev = img
        else:
            nodes.append(node(bat, "ImageBatch", (MX + 1130, y), (220, 60), [],
                              inputs=[inp("image1", "IMAGE"), inp("image2", "IMAGE")], outputs=[out("IMAGE", "IMAGE")]))
            link(prev, 0, bat, 0, "IMAGE")
            link(img, 0, bat, 1, "IMAGE")
            prev = bat
    save(49, (MX + 1380, MY), prev, "plan3d/passes/free_zone_masks",
         "2.5  zone masks 0-5  (red, green, blue, yellow, magenta, cyan)", (520, 400))
    nodes.append(node(29, "MarkdownNote", (MX, MY + 880), (900, 420), [FREE_NOTE], title="2  Free camera  (how)"))
    group("2  FREE CAMERA  --  hide parts, set any angle: depth + normal + ID + zone masks baked live",
          X2, Y2, MX + 1940 - X2, 1400, "#4a2f5a")

    # ======================== 3  FIXED CAMERAS ==============================
    X3, Y3 = 0, 2640
    nodes.append(node(100, "Get3DComponents", (X3 + 20, Y3 + 60), (300, 60), [],
                      inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")], title="model (parts hidden)"))
    link(21, 0, 100, 0, "FILE_3D")
    nodes.append(node(101, "Get3DComponents", (X3 + 20, Y3 + 160), (300, 60), [],
                      inputs=[inp("model_3d", "FILE_3D")], outputs=[out("mesh", "MESH")], title="ID model (parts hidden)"))
    link(22, 0, 101, 0, "FILE_3D")
    nodes.append(node(102, "MarkdownNote", (X3 + 20, Y3 + 260), (300, 420), [FIXED_NOTE], title="3  Fixed cameras"))
    for ci, cam in enumerate(CAMERAS):
        cx = X3 + 360 + ci * 700
        for k, (pname, mode, which) in enumerate(PASSES):
            rid = 110 + ci * 10 + k
            y = Y3 + 60 + k * 420
            render(rid, (cx, y), 100 if which == "beauty" else 101, mode, "%s  %s" % (cam, pname))
            link(12, 4 + ci, rid, 2, "LOAD3D_CAMERA")
            save(rid + 5, (cx + 320, y), rid, "plan3d/passes/%s_%s" % (cam, pname), "%s  %s" % (cam, pname),
                 (340, 380))
    group("3  FIXED CAMERAS  --  six views framed from the model: depth, normal, ID each",
          X3, Y3, 360 + 6 * 700, 1340, "#2d4a3e")

    # fill link references on the nodes
    by_id = {n["id"]: n for n in nodes}
    for l_id, s, ss, d, ds, t in links:
        by_id[s]["outputs"][ss]["links"].append(l_id)
        by_id[d]["inputs"][ds]["link"] = l_id
    for i, n in enumerate(sorted(nodes, key=lambda n: (n["pos"][0], n["pos"][1]))):
        n["order"] = i

    graph = {"last_node_id": max(by_id), "last_link_id": lid[0], "nodes": nodes, "links": links,
             "groups": groups, "config": {}, "extra": {"ds": {"scale": 0.45, "offset": [200, 900]}},
             "version": 0.4}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2)
    print("wrote:  %s  (%d nodes, %d links)" % (OUT, len(nodes), len(links)))
    if os.path.isdir(COMFY_INPUT):
        shutil.copy(PLAN_SRC, os.path.join(COMFY_INPUT, PLAN_FILE))
        print("copied: %s" % os.path.join(COMFY_INPUT, PLAN_FILE))
    if os.path.isdir(os.path.dirname(SIDEBAR)):
        os.makedirs(SIDEBAR, exist_ok=True)
        shutil.copy(OUT, os.path.join(SIDEBAR, os.path.basename(OUT)))
        print("copied: %s" % SIDEBAR)


if __name__ == "__main__":
    main()
