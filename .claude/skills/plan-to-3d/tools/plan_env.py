"""
Check that this machine can run the plan tools, and say how to fix it if not.

    python tools/plan_env.py        # exit 0 = ready

plan_read, plan_check, build_massing and render_views need Python 3.10+ with
the packages in requirements.txt, and poppler's pdftoppm to turn PDF pages
into images. Each package is imported, then a small model is built and
exported the way build_massing does it, because an import can succeed while
something the build needs is still missing. Nothing is installed here: the
commands are printed, and the plan-to-3d skill asks the user before running
them.

The tools find pdftoppm with pdftoppm() below: $MP_PDFTOPPM, then PATH, then
the folders the usual installers use, so a poppler installed a minute ago is
found before the terminal is restarted.
"""

import glob
import importlib
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))

# import name, pip name -- keep in step with ../requirements.txt
PACKAGES = [("numpy", "numpy"), ("yaml", "PyYAML"), ("shapely", "shapely"),
            ("trimesh", "trimesh"), ("mapbox_earcut", "mapbox-earcut"), ("scipy", "scipy"),
            ("cv2", "opencv-python-headless"), ("PIL", "Pillow")]

SMOKE = """
name: env-smoke
output: {dir: out, base: smoke}
vars: {H: 2.6}
palette: {shell: [200, 200, 200], glass: [150, 190, 205]}
zones: [{slug: a}, {slug: b}]
zone_regions:
  - {zone: a, x: [null, 2]}
  - {zone: b, x: [2, null]}
items:
  - {type: prism, name: floor, poly: [[0, 0], [4, 0], [4, 3], [0, 3]], y: [-0.15, 0]}
  - {type: prism, name: col, poly: [[0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 1], [0, 1]], y: [0, H]}
  - {type: wall, name: wall, p0: [0, 3], p1: [4, 3], t: 0.15, y: [0, H],
     openings: [{at: 1.5, w: 1.0, kind: window}]}
"""


def _natural(path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", path)]


def pdftoppm():
    """Path of poppler's pdftoppm, or None."""
    exe = os.environ.get("MP_PDFTOPPM")
    if exe and os.path.isfile(exe):
        return exe
    exe = shutil.which("pdftoppm")
    if exe:
        return exe
    home = os.path.expanduser("~")
    local = os.environ.get("LOCALAPPDATA") or os.path.join(home, "AppData", "Local")
    places = [os.path.join(local, "Microsoft", "WinGet", "Packages", "oschwartz10612.Poppler*",
                           "poppler-*", "Library", "bin", "pdftoppm.exe"),
              os.path.join(local, "Microsoft", "WinGet", "Links", "pdftoppm.exe"),
              os.path.join(home, "scoop", "shims", "pdftoppm.exe"),
              r"C:\ProgramData\chocolatey\bin\pdftoppm.exe",
              "/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm", "/usr/bin/pdftoppm"]
    if os.environ.get("CONDA_PREFIX"):
        places.append(os.path.join(os.environ["CONDA_PREFIX"], "Library", "bin", "pdftoppm.exe"))
    for pattern in places:
        hits = sorted(glob.glob(pattern), key=_natural)
        if hits:
            return hits[-1]                 # the newest version folder sorts last
    return None


def require_pdftoppm():
    exe = pdftoppm()
    if exe is None:
        sys.exit("pdftoppm (poppler) not found -- run: python tools/plan_env.py")
    return exe


def poppler_install():
    """(command, alternatives) that install poppler on this OS."""
    if sys.platform == "win32":
        return ("winget install --id oschwartz10612.Poppler -e "
                "--accept-source-agreements --accept-package-agreements",
                "or: conda install -c conda-forge poppler / scoop install poppler")
    if sys.platform == "darwin":
        return "brew install poppler", ""
    return "sudo apt-get install -y poppler-utils", "Fedora: sudo dnf install poppler-utils"


def smoke():
    """Build and export a small model the way build_massing does: an extruded
    outline, a wall with a window, every part cut along a zone boundary. Then
    the image calls plan_check makes. None if it all works, else the error."""
    sys.path.insert(0, HERE)
    import numpy as np
    import cv2
    from PIL import Image
    import spec as S
    import build_massing as B
    comfy = os.environ.get("MP_COMFY_3D")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "smoke.yaml")
            with open(path, "w", encoding="utf-8") as f:
                f.write(SMOKE)
            os.environ["MP_COMFY_3D"] = os.path.join(tmp, "no-comfy")   # copy nothing into ComfyUI
            spec = S.load(path)
            parts, id_parts, _ = B.build(spec)
            open_ = sorted(n for n, m in id_parts.items() if not m.is_watertight)
            if open_:                       # build_massing falls back to uncapped cuts
                return "zone cut left open pieces: " + ", ".join(open_)
            with redirect_stdout(io.StringIO()):
                B.export(spec, parts, id_parts)
            for f in ("smoke.glb", "smoke_ids.glb"):
                if not os.path.getsize(os.path.join(tmp, "out", f)):
                    return "empty " + f
        ink = np.full((32, 32), 255, np.uint8)
        ink[10:20, 10:20] = 0
        cv2.distanceTransform(ink, cv2.DIST_L2, 3)
        cv2.imencode(".png", ink)
        Image.fromarray(ink).save(io.BytesIO(), "PNG")
    except Exception as e:                  # report it; the fix is a reinstall either way
        return "%s: %s" % (type(e).__name__, e)
    finally:
        if comfy is None:
            os.environ.pop("MP_COMFY_3D", None)
        else:
            os.environ["MP_COMFY_3D"] = comfy
    return None


def main():
    todo = []
    print("plan tools environment  (%s)" % sys.executable)

    py = "%d.%d.%d" % sys.version_info[:3]
    if sys.version_info < (3, 10):
        print("  OLD      python %s -- 3.10 or newer needed" % py)
        todo.append("install Python 3.12 (Windows: winget install -e --id Python.Python.3.12; "
                    "macOS: brew install python@3.12) and run this again with it")
    else:
        print("  ok       python %s" % py)

    missing = []
    for mod, pip in PACKAGES:
        try:
            m = importlib.import_module(mod)
            print("  ok       %-24s %s" % (pip, getattr(m, "__version__", "")))
        except ImportError:
            print("  MISSING  %s" % pip)
            missing.append(pip)
    if missing:
        todo.append('"%s" -m pip install %s' % (sys.executable, " ".join(missing)))
        print("  skipped  test build (needs the packages)")
    else:
        err = smoke()
        if err is None:
            print("  ok       test build (outline, wall + window, zone cut, GLB export)")
        else:
            print("  FAILED   test build: %s" % err)
            todo.append('"%s" -m pip install --upgrade -r "%s"' % (
                sys.executable, os.path.join(os.path.dirname(HERE), "requirements.txt")))

    exe = pdftoppm()
    if exe is None:
        print("  MISSING  pdftoppm (poppler, reads PDF drawings)")
        cmd, alt = poppler_install()
        todo.append(cmd + ("    (%s)" % alt if alt else ""))
    else:
        r = subprocess.run([exe, "-v"], capture_output=True, text=True)
        version = (r.stderr or r.stdout).strip().splitlines()[0] if (r.stderr or r.stdout).strip() else ""
        note = "" if shutil.which("pdftoppm") else "  (not on PATH yet; the tools find it anyway)"
        print("  ok       pdftoppm %s  %s%s" % (version.replace("pdftoppm version ", ""), exe, note))

    if todo:
        print("\nTo install what is missing (the plan-to-3d skill asks before running these):")
        for t in todo:
            print("  " + t)
        print("RESULT: NOT READY")
        return 1
    print("RESULT: READY")
    return 0


if __name__ == "__main__":
    sys.exit(main())
