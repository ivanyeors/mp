"""Floor Plan -> 3D (mpillow) -- any plan image to a clean, metric GLB, inside ComfyUI.

Wraps plan3d.py. One node: plan image in; the massing GLB, its zone-coloured
ID twin (same part names + __z<n>, for GLB Part Filter and RenderMesh
"vertex colors"), a picture of what was understood, a report, and six
framing cameras out. Plug the GLBs into the free-camera chain (GLB Part
Filter -> Preview 3D (Advanced) -> Get3DComponents -> RenderMesh) exactly
like build_massing.py's output.

Recogniser: the CubiCasa5K wall/door/window segmenter
(huggingface.co/Yytsi/floorplan-to-3d-walls, MIT; trained on CC BY-NC
data) in ComfyUI/models/floorplan/, or `cv` for clean CAD exports with no
model. Needs segmentation-models-pytorch (`pip install --no-deps
segmentation-models-pytorch`) for the model path.

Rooms (optional, on by default): Raster2Seq (SIGGRAPH'26,
huggingface.co/haopt/Raster2Seq, MIT) reads labelled room polygons; they
become the zones and supply the hairline partitions the segmenter misses.
Checkpoints go in ComfyUI/models/floorplan/raster2seq/ named cubicasa5k.pth
or raster2graph-512.pth. Vendored in r2s/, pure PyTorch, no CUDA build.

Install: junction (or copy) this folder into ComfyUI/custom_nodes, restart.
"""

import hashlib
import os

import numpy as np
from typing_extensions import override

import folder_paths
from comfy_api.latest import IO, ComfyExtension, Types

from . import plan3d

_MODEL_DIR = os.path.join(folder_paths.models_dir, "floorplan")
os.makedirs(_MODEL_DIR, exist_ok=True)
folder_paths.add_model_folder_path("floorplan", _MODEL_DIR)
CAMERAS = ["iso_se", "iso_sw", "iso_ne", "iso_nw", "top", "eye_level"]


def _models():
    return [f for f in folder_paths.get_filename_list("floorplan") if f.endswith(".safetensors")]


def _room_models():
    found = [f for f in folder_paths.get_filename_list("floorplan") if f.endswith(".pth")]
    found.sort(key=lambda f: "cubicasa" not in f)  # CubiCasa first: it reads doors and thin partitions
    return found + ["none"]


class MPFloorPlanTo3D(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPFloorPlanTo3D",
            display_name="Floor Plan -> 3D (mpillow)",
            category="3d/mpillow",
            search_aliases=["floor plan to 3d", "plan to glb", "extrude walls", "massing"],
            description=(
                "Reads walls, doors and windows off a floor plan image and builds a clean metric "
                "massing GLB (walls snapped to the plan axes, lintels over doors, sills under "
                "windows, one floor slab per zone) plus its zone-coloured ID twin. With a room model, the rooms "
                "become the zones and the thin partitions between them are added. Paint missed "
                "walls into the plan's mask (Load Image mask editor) and wire it to add_walls."
            ),
            inputs=[
                IO.Image.Input("plan", tooltip="The floor plan, north up."),
                IO.Float.Input("plan_width_m", default=10.0, min=0.5, max=500.0, step=0.01,
                               tooltip="Real west-east width of the walls, outer face to outer face (read it off the overall dimension)."),
                IO.Float.Input("wall_height", default=2.8, min=1.0, max=20.0, step=0.05),
                IO.Float.Input("door_height", default=2.1, min=0.5, max=20.0, step=0.05,
                               tooltip="Lintel underside over door and window gaps."),
                IO.Float.Input("sill_height", default=0.9, min=0.0, max=5.0, step=0.05,
                               tooltip="Top of the sill under window gaps."),
                IO.Combo.Input("recogniser", options=["model", "cv"], default="model",
                               tooltip="model: CubiCasa5K wall/door/window segmenter (ignores furniture and text). "
                                       "cv: dark + thick strokes, for clean CAD exports, no model needed."),
                IO.Combo.Input("seg_model", options=_models() or ["(put floorplan-to-3d-walls.safetensors in models/floorplan)"],
                               tooltip="Weights in ComfyUI/models/floorplan."),
                IO.Combo.Input("room_model", options=_room_models(),
                               tooltip="Raster2Seq room reader (models/floorplan/raster2seq). Rooms become the zones and "
                                       "fill in thin partitions the wall model misses. cubicasa5k: best on real plans; "
                                       "raster2graph-512: straighter but coarser rooms, no doors. none: walls only."),
                IO.Boolean.Input("room_walls", default=True,
                                 tooltip="Add partitions between detected rooms where the plan draws a solid straight "
                                         "line (dotted curtain tracks and furniture are skipped). Off: rooms are zones only."),
                IO.Boolean.Input("ceiling", default=True, tooltip="Adds a `ceiling` part (hide it for top-down views)."),
                IO.Float.Input("snap_deg", default=6.0, min=0.0, max=30.0, step=0.5, advanced=True,
                               tooltip="Wall edges within this angle of the plan axes are snapped exactly straight. 0 = off."),
                IO.Float.Input("max_opening_m", default=2.2, min=0.3, max=10.0, step=0.05, advanced=True,
                               tooltip="Widest door / window gap to bridge with a lintel; also seals rooms for zoning."),
                IO.Float.Input("min_room_m2", default=1.0, min=0.0, max=1000.0, step=0.1, advanced=True,
                               tooltip="Smaller enclosed areas are not zones."),
                IO.String.Input("filename_prefix", default="plan3d/plan", advanced=True,
                                tooltip="GLBs are written to output/<prefix>_3d.glb and _3d_ids.glb."),
                IO.Mask.Input("add_walls", optional=True,
                              tooltip="White = extra wall. Paint missed partitions over the plan in the Load Image mask editor."),
                IO.Mask.Input("erase", optional=True, tooltip="White = never a wall (e.g. drawn racks or furniture read as walls)."),
                IO.Image.Input("zone_map", optional=True,
                               tooltip="Plan-sized image painted with flat red / green / blue / yellow / magenta / cyan "
                                       "regions; overrides the automatic room zones."),
            ],
            outputs=[
                IO.File3DAny.Output(display_name="model_3d", tooltip="The massing, metres, Y up."),
                IO.File3DAny.Output(display_name="id_model_3d",
                                    tooltip="Same parts cut along the zones, flat zone colours (__z<n> suffix)."),
                IO.Image.Output(display_name="understood",
                                tooltip="Zones tinted, walls black, door gaps orange, window gaps blue."),
                IO.String.Output(display_name="report"),
            ] + [IO.Load3DCamera.Output(display_name=c) for c in CAMERAS],
        )

    @classmethod
    def execute(cls, plan, plan_width_m, wall_height, door_height, sill_height, recogniser, seg_model,
                room_model, room_walls, ceiling, snap_deg, max_opening_m, min_room_m2, filename_prefix,
                add_walls=None, erase=None, zone_map=None):
        rgb = plan[0, :, :, :3].cpu().numpy().astype(np.float32)
        H, W = rgb.shape[:2]

        def plane(t):
            if t is None:
                return None
            a = t[0].cpu().numpy() if t.ndim == 3 else t.cpu().numpy()
            if a.shape[:2] != (H, W):
                import cv2
                a = cv2.resize(a, (W, H), interpolation=cv2.INTER_NEAREST)
            return a

        import comfy.model_management as mm
        dev = str(mm.get_torch_device())
        if recogniser == "model":
            path = folder_paths.get_full_path("floorplan", seg_model)
            if not path:
                raise ValueError("Floor Plan -> 3D: no segmenter weights in models/floorplan "
                                 "(huggingface.co/Yytsi/floorplan-to-3d-walls, best.safetensors)")
            labels = plan3d.segment(rgb, plan3d.load_seg_model(path, dev), device=dev)
        else:
            labels = plan3d.detect_walls_cv(rgb)

        rooms = None
        if room_model != "none":
            path = folder_paths.get_full_path("floorplan", room_model)
            if not path:
                raise ValueError("Floor Plan -> 3D: %s not found in models/floorplan "
                                 "(huggingface.co/haopt/Raster2Seq, cubicasa5k/checkpoint.pth)" % room_model)
            rooms = plan3d.detect_rooms(rgb, labels, path, dev)

        zm = None
        if zone_map is not None:
            zm = zone_map[0, :, :, :3].cpu().numpy()
            if zm.shape[:2] != (H, W):
                import cv2
                zm = cv2.resize(zm, (W, H), interpolation=cv2.INTER_NEAREST)

        parts, id_parts, info = plan3d.build(
            labels, plan_width_m, wall_height, door_height, sill_height, ceiling=ceiling,
            add_walls=plane(add_walls), erase=plane(erase), zone_map=zm,
            max_opening_m=max_opening_m, min_room_m2=min_room_m2, snap_deg=snap_deg,
            rooms=rooms, plan_rgb=rgb, room_walls=room_walls)

        out_dir = folder_paths.get_output_directory()
        base = os.path.join(out_dir, filename_prefix.replace("/", os.sep))
        os.makedirs(os.path.dirname(base) or out_dir, exist_ok=True)
        glb = plan3d.export(parts, base + "_3d.glb")
        glb_ids = plan3d.export(id_parts, base + "_3d_ids.glb")

        import torch
        understood = torch.from_numpy(plan3d.overlay(info, rgb).astype(np.float32) / 255.0)[None]
        cams = plan3d.cameras(info)
        report = plan3d.report(info, parts, id_parts) + "\n\nsaved      %s\n           %s" % (glb, glb_ids)
        return IO.NodeOutput(Types.File3D(glb), Types.File3D(glb_ids), understood, report,
                             *[cams[c] for c in CAMERAS])


class MPPlan3DExtension(ComfyExtension):
    @override
    async def get_node_list(self):
        return [MPFloorPlanTo3D]


async def comfy_entrypoint():
    return MPPlan3DExtension()
