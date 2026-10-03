"""GLB Part Filter -- show / hide named parts of a 3D model inside ComfyUI.

ComfyUI's core 3D nodes treat a GLB as one blob: Get3DComponents merges every
scene node into a single mesh, and the Load 3D viewer has no layer list. This
node sits in front of them. It opens the GLB (or OBJ / STL) with trimesh,
drops -- or keeps only -- the parts whose names match a list you type on the
canvas, writes the result to ComfyUI/temp and hands it on as FILE_3D, so it
plugs into Preview 3D (Advanced) for an orbit camera and into
Get3DComponents / RenderMesh for depth and ID passes.

Part names are the glTF node / mesh names -- for the showroom massing they
are the keys of `parts` in tools/build_massing.py (`wall_north`, `poly_roof`,
`bench_1`, ...). The zone-coloured ID twins carry a `__z<n>` suffix per area
(`wall_north__z0`); the match ignores that suffix, so one list drives the
beauty model and its ID twin identically and the masks stay in step with
the depth.

Install: junction (or copy) this folder into ComfyUI/custom_nodes and restart
ComfyUI. Needs trimesh, which build_massing.py already requires.
"""

import fnmatch
import hashlib
import os
import re
from pathlib import Path

from typing_extensions import override

import folder_paths
from comfy_api.latest import IO, ComfyExtension, Types

MESH_EXTENSIONS = {".gltf", ".glb", ".obj", ".stl"}
_ZONE_SUFFIX = re.compile(r"__z\d+$")
_OUT_SUBDIR = "mp_glb_parts"


def _list_models():
    input_dir = os.path.join(folder_paths.get_input_directory(), "3d")
    os.makedirs(input_dir, exist_ok=True)
    base = Path(folder_paths.get_input_directory())
    return sorted(
        str(p.relative_to(base)).replace("\\", "/")
        for p in Path(input_dir).rglob("*")
        if p.suffix.lower() in MESH_EXTENSIONS
    )


def parse_patterns(text):
    """One pattern per line or comma; `#` starts a comment; * ? [] wildcards."""
    pats = []
    for line in (text or "").splitlines():
        line = line.split("#", 1)[0]
        for tok in line.split(","):
            tok = tok.strip()
            if tok:
                pats.append(tok.lower())
    return pats


def base_name(name):
    return _ZONE_SUFFIX.sub("", name)


def matches(name, patterns):
    low, base = name.lower(), base_name(name).lower()
    return any(fnmatch.fnmatchcase(low, p) or fnmatch.fnmatchcase(base, p) for p in patterns)


def _source_key(file_3d):
    src = file_3d.get_source()
    if isinstance(src, str):
        st = os.stat(src)
        return "%s|%d|%d" % (os.path.abspath(src), st.st_size, st.st_mtime_ns)
    return "mem|" + hashlib.sha1(file_3d.get_bytes()).hexdigest()


class MPGLBPartFilter(IO.ComfyNode):
    @classmethod
    def define_schema(cls):
        return IO.Schema(
            node_id="MPGLBPartFilter",
            display_name="GLB Part Filter (mpillow)",
            category="3d/mpillow",
            search_aliases=["hide parts", "show parts", "glb layers", "filter mesh parts", "cutaway"],
            description=(
                "Hide, or keep only, the named parts of a GLB / OBJ / STL and pass the result on "
                "as a 3D file. Names are the glTF node names; a trailing __z<n> zone suffix is "
                "ignored so one list drives a model and its ID twin. Wildcards * ? [] work; one "
                "name per line or comma separated; # starts a comment."
            ),
            inputs=[
                IO.Combo.Input(
                    "model_file", options=["none"] + _list_models(), upload=IO.UploadType.model,
                    tooltip="Model in ComfyUI/input/3d. Ignored when model_3d is connected.",
                ),
                IO.String.Input(
                    "parts", multiline=True, default="",
                    placeholder="wall_north\npoly_roof*\nbench_?   # one per line, wildcards ok",
                    tooltip="Part names (glTF node names) to hide, or to keep with mode = show_only.",
                ),
                IO.Combo.Input(
                    "mode", options=["hide", "show_only"], default="hide",
                    tooltip="hide: drop the listed parts.  show_only: keep just the listed parts.",
                ),
                IO.MultiType.Input(
                    "model_3d",
                    types=[IO.File3DGLB, IO.File3DGLTF, IO.File3DOBJ, IO.File3DSTL, IO.File3DAny],
                    optional=True,
                    tooltip="3D file from another node; overrides model_file.",
                ),
            ],
            outputs=[
                IO.File3DAny.Output(display_name="model_3d", tooltip="The filtered model, always GLB."),
                IO.String.Output(display_name="all_parts",
                                 tooltip="Every part name in the source, one per line (zone suffix stripped, counted)."),
                IO.String.Output(display_name="affected", tooltip="The part names the list matched (hidden, or kept)."),
                IO.Int.Output(display_name="visible_count", tooltip="Number of scene parts left in the output."),
            ],
        )

    @classmethod
    def validate_inputs(cls, model_file, **kwargs):
        if not model_file or model_file == "none":
            return True
        if not folder_paths.exists_annotated_filepath(model_file):
            return "Invalid 3D model file: %s" % model_file
        return True

    @classmethod
    def fingerprint_inputs(cls, model_file, parts, mode, model_3d=None, **kwargs):
        if model_3d is not None:
            key = _source_key(model_3d)
        elif model_file and model_file != "none":
            key = _source_key(Types.File3D(folder_paths.get_annotated_filepath(model_file)))
        else:
            key = "none"
        return hashlib.sha1(("%s|%s|%s" % (key, parts, mode)).encode("utf-8")).hexdigest()

    @classmethod
    def execute(cls, model_file, parts, mode, model_3d=None, **kwargs):
        import trimesh

        if model_3d is None:
            if not model_file or model_file == "none":
                raise ValueError("GLB Part Filter: pick a model_file or connect model_3d")
            model_3d = Types.File3D(folder_paths.get_annotated_filepath(model_file))

        fmt = (model_3d.format or "glb").lower()
        scene = trimesh.load(model_3d.get_data(), file_type=fmt, force="scene", process=False)
        names = list(scene.graph.nodes_geometry)
        if not names:
            raise ValueError("GLB Part Filter: no geometry found in the model")

        patterns = parse_patterns(parts)
        hit = [n for n in names if matches(n, patterns)]
        if mode == "hide":
            drop = hit
        else:
            keep = set(hit)
            drop = [n for n in names if n not in keep]
        if len(drop) == len(names):
            raise ValueError("GLB Part Filter: every part would be hidden (%d parts, mode %s)"
                             % (len(names), mode))

        counts = {}
        for n in names:
            counts[base_name(n)] = counts.get(base_name(n), 0) + 1
        all_parts = "\n".join("%s  (x%d)" % (b, c) if c > 1 else b for b, c in sorted(counts.items()))
        affected_bases = sorted({base_name(n) for n in hit})
        affected = "\n".join(affected_bases) if affected_bases else "(nothing matched)"

        if not drop:
            return IO.NodeOutput(model_3d, all_parts, affected, len(names))

        # Remove through the scene graph, so a mesh shared by several nodes
        # only disappears where a matching node references it.
        for node_name in drop:
            geom_name = scene.graph[node_name][1]
            scene.graph.transforms.remove_node(node_name)
            still_used = any(scene.graph[n][1] == geom_name for n in scene.graph.nodes_geometry)
            if not still_used and geom_name in scene.geometry:
                scene.geometry.pop(geom_name)

        key = hashlib.sha1(("%s|%s" % (_source_key(model_3d), "\n".join(sorted(drop))))
                           .encode("utf-8")).hexdigest()[:16]
        out_dir = os.path.join(folder_paths.get_temp_directory(), _OUT_SUBDIR)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "parts_%s.glb" % key)
        if not os.path.exists(out_path):
            scene.export(out_path, file_type="glb")
        return IO.NodeOutput(Types.File3D(out_path), all_parts, affected, len(names) - len(drop))


class MPGLBPartsExtension(ComfyExtension):
    @override
    async def get_node_list(self):
        return [MPGLBPartFilter]


async def comfy_entrypoint():
    return MPGLBPartsExtension()
