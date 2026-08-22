#!/usr/bin/env python3
"""Print a stable structural digest of a graphify graph.json.

Why not just `git diff` the file? Because a rebuild is only *partly*
deterministic. Measured on this repo:

  - node ids and edges reproduce exactly, from any starting state
  - community assignment does NOT (the clustering pass is seeded by whatever
    graph.json it started from — observed 839 / 846 / 849 communities for
    structurally identical graphs)

So a byte-level check would fail on pull requests that changed nothing. This
digest covers the structure that is actually reproducible, which is also the
part that goes stale when code changes without a graph refresh.

Usage: graphify-digest.py graphify-out/graph.json
"""
import hashlib
import json
import sys


def digest(path: str) -> tuple[str, int, int]:
    with open(path) as fh:
        graph = json.load(fh)

    nodes = sorted(str(n["id"]) for n in graph["nodes"])
    edges = sorted(
        f'{l["source"]}\t{l["target"]}\t{l.get("relation", "")}'
        for l in graph["links"]
    )

    h = hashlib.sha256()
    for item in nodes:
        h.update(b"N\x00" + item.encode() + b"\n")
    for item in edges:
        h.update(b"E\x00" + item.encode() + b"\n")
    return h.hexdigest(), len(nodes), len(edges)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sha, n, e = digest(sys.argv[1])
    print(f"{sha}  nodes={n} edges={e}")
