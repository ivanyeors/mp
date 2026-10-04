"""Raster2Seq (Phung & Averbuch-Elor, SIGGRAPH'26; github.com/Cornell-VAILab/Raster2Seq, MIT),
inference-only subset, vendored so its top-level `models` / `datasets` / `util` names cannot
clash with other ComfyUI packages. Deformable attention runs on the pure-PyTorch path, so no
CUDA extension needs compiling."""
