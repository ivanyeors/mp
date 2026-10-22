#!/usr/bin/env python3
"""Add the data layer to graphify-out/graph.json.

graphify's AST pass knows the schema (tables, views and functions from
supabase/migrations) and the code (functions, imports, calls), but nothing
connects the two: a Supabase call is just `.from("orders")` with a string, so
"what writes inventory_transactions?" had no answer in the graph. This pass
reads the source and adds the missing edges:

  function  --reads_from-->  table/view    .from("t").select(...)
  function  --writes_to--->  table         .from("t").insert/update/upsert/delete
  function  --calls_rpc--->  sql function  .rpc("fn")
  function  --requests---->  endpoint      a route handler's URL in the source ("/api/...")
  endpoint  --handled_by-->  GET()/POST()  exported handlers of app/**/route.ts
  page      --uses_action->  server action imported anywhere in the page's UI tree
  page      --loads------->  data function the page's UI tree imports
  page      --reads_from / writes_to / requests   the UI tree's own data calls
  table     --references-->  table         foreign keys graphify's SQL pass missed

UI files (React components, hooks, pages) are kept out of the graph by
.graphifyignore. Each `app/**/page.tsx` comes back as one node per route,
labelled with its URL (`/settings/inventory`), carrying only the data its
component tree touches, so the Admin Panel and storefront pages are
reachable from the tables without the component internals.

Everything added here is tagged `_origin: "dataflow"` and stripped before it
is re-added, so the pass is idempotent and deterministic: running it twice, or
after graphify has preserved last run's edges, produces the same graph. CI's
freshness check depends on that.

It also writes graphify-out/DATA_LAYER.md, a per-table and per-page index of
the same edges for reading or grepping without the graph tools.

Runs inside graphify's pinned environment (for tree-sitter); scripts/graphify
calls it after every `update`.

Usage (from the repo root):
  graphify-dataflow.py [graph.json]           add the data layer
  graphify-dataflow.py --strip [graph.json]   remove it (scripts/graphify does this before `update`)
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import tree_sitter_typescript as tsts
from tree_sitter import Language, Parser

ORIGIN = "dataflow"
ROOT = Path.cwd()  # reset from the graph path in __main__: <root>/graphify-out/graph.json
SOURCE_DIRS = ("app", "lib", "components", "hooks", "scripts")
MIGRATIONS = "supabase/migrations"
TEST_FILE = re.compile(r"(/__tests__/|\.test\.tsx?$|\.spec\.tsx?$|\.check\.tsx?$)")
WRITE_OPS = {"insert", "update", "upsert", "delete"}
HTTP_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")
NOT_A_CLIENT = {"Array", "Buffer", "Uint8Array", "Object", "String", "Set", "Map"}

TS = Parser(Language(tsts.language_typescript()))
TSX = Parser(Language(tsts.language_tsx()))


# --------------------------------------------------------------------- graph

def load_graph(path: Path) -> dict:
    graph = json.loads(path.read_text(encoding="utf-8"))
    graph["nodes"] = [n for n in graph["nodes"] if n.get("_origin") != ORIGIN]
    graph["links"] = [l for l in graph["links"] if l.get("_origin") != ORIGIN]
    return graph


class Index:
    """Lookups over the AST graph: symbols by file, schema objects by name."""

    def __init__(self, graph: dict):
        self.nodes = {n["id"]: n for n in graph["nodes"]}
        self.by_file_label: dict[tuple[str, str], str] = {}
        self.file_node: dict[str, str] = {}
        self.files_in_graph: set[str] = set()
        self.schema: dict[str, str] = {}  # normalised name -> node id
        schema_src: dict[str, str] = {}

        for n in sorted(graph["nodes"], key=lambda n: (n.get("source_file") or "", _line(n), n["id"])):
            sf = n.get("source_file") or ""
            if not sf:
                continue
            self.files_in_graph.add(sf)
            label = n.get("label", "")
            self.by_file_label.setdefault((sf, label), n["id"])
            if n.get("source_location") == "L1" and not n.get("_callable") and (
                label == os.path.basename(sf) or sf.endswith("/" + label)
            ):
                self.file_node.setdefault(sf, n["id"])
            if sf.startswith(MIGRATIONS + "/") and not label.endswith(".sql"):
                name = schema_name(label)
                # Latest migration wins: a view or function redefined later is
                # the one that is live now.
                if name and sf >= schema_src.get(name, ""):
                    self.schema[name] = n["id"]
                    schema_src[name] = sf

        pairs = set()
        for l in graph["links"]:
            pairs.add(frozenset((l["source"], l["target"])))
        self.connected = pairs

    def symbol(self, path: str, names: list[str]) -> str | None:
        """The graph node for the innermost enclosing symbol that graphify kept."""
        for name in names:
            for label in (f"{name}()", f".{name}()", name):
                nid = self.by_file_label.get((path, label))
                if nid:
                    return nid
        return self.file_node.get(path)


def _line(node: dict) -> int:
    loc = node.get("source_location") or ""
    return int(loc[1:]) if loc[1:].isdigit() else 0


def schema_name(label: str) -> str:
    name = label.strip().removesuffix("()")
    name = name.removeprefix("public.").strip('"').lower()
    return name if IDENT.match(name) else ""


# ------------------------------------------------------------------ parsing

def text(node) -> str:
    return node.text.decode("utf-8", "replace") if node is not None else ""


def walk(node):
    stack = [node]
    while stack:
        cur = stack.pop()
        yield cur
        stack.extend(reversed(cur.children))


def string_value(node) -> str | None:
    """Literal value of a string, or a template string with `*` for each ${}."""
    if node is None:
        return None
    if node.type == "string":
        return "".join(text(c) for c in node.children if c.type in ("string_fragment", "escape_sequence"))
    if node.type == "template_string":
        out = []
        for c in node.children:
            if c.type == "template_substitution":
                out.append("*")
            elif c.type == "string_fragment":
                out.append(text(c))
        return "".join(out)
    return None


def enclosing_names(node) -> list[str]:
    """Names of the functions around `node`, innermost first."""
    names = []
    cur = node.parent
    while cur is not None:
        t = cur.type
        name = None
        if t in ("function_declaration", "generator_function_declaration", "method_definition", "class_declaration"):
            name = text(cur.child_by_field_name("name"))
        elif t in ("arrow_function", "function_expression", "function"):
            parent = cur.parent
            if parent is not None and parent.type == "variable_declarator":
                name = text(parent.child_by_field_name("name"))
            elif parent is not None and parent.type in ("pair", "public_field_definition"):
                key = parent.child_by_field_name("key") or parent.child_by_field_name("name")
                name = text(key)
        if name:
            names.append(name)
        cur = cur.parent
    return names


def call_chain(call) -> list[str]:
    """Method names chained after `call`: .from("t").select().eq() -> [select, eq]."""
    methods = []
    cur = call
    while True:
        parent = cur.parent
        while parent is not None and parent.type in ("non_null_expression", "parenthesized_expression"):
            cur, parent = parent, parent.parent
        if parent is None or parent.type != "member_expression" or parent.child_by_field_name("object") != cur:
            return methods
        grand = parent.parent
        if grand is None or grand.type != "call_expression" or grand.child_by_field_name("function") != parent:
            return methods
        methods.append(text(parent.child_by_field_name("property")))
        cur = grand


def fetch_method(literal) -> str:
    """HTTP method of fetch("/api/..", {method}) when the literal is fetch's URL."""
    args = literal.parent
    if args is None or args.type != "arguments" or args.named_children[0] != literal:
        return ""
    call = args.parent
    fn = text(call.child_by_field_name("function")) if call is not None else ""
    if not fn.endswith("fetch"):
        return ""
    if len(args.named_children) < 2:
        return "GET"
    opts = args.named_children[1]
    if opts.type != "object":
        return ""
    for pair in opts.named_children:
        if pair.type == "pair" and text(pair.child_by_field_name("key")).strip("'\"") == "method":
            value = string_value(pair.child_by_field_name("value"))
            return value.upper() if value and value.upper() in HTTP_METHODS else ""
    return "GET"


class Source:
    """Data calls, API references and imports in one TypeScript file."""

    def __init__(self, path: str):
        self.path = path
        raw = (ROOT / path).read_bytes()
        tree = (TSX if path.endswith(".tsx") else TS).parse(raw)
        root = tree.root_node
        self.use_server = _has_directive(root, "use server")

        self.db: list[tuple[list[str], str, str, int]] = []      # names, table, op, line
        self.rpc: list[tuple[list[str], str, int]] = []           # names, fn, line
        self.api: list[tuple[list[str], str, str, int]] = []      # names, url, method, line
        self.imports: list[tuple[str, list[str], int]] = []       # module spec, names ("*" = whole), line

        for node in walk(root):
            t = node.type
            if t == "call_expression":
                self._call(node)
            elif t in ("string", "template_string"):
                url = url_in(string_value(node))
                if url:
                    line = node.start_point[0] + 1
                    self.api.append((enclosing_names(node), url, fetch_method(node), line))
            elif t in ("import_statement", "export_statement"):
                self._import(node)

    def _call(self, node):
        fn = node.child_by_field_name("function")
        args = node.child_by_field_name("arguments")
        if fn is None or args is None:
            return
        if fn.type == "import" and args.named_children:
            spec = string_value(args.named_children[0])
            if spec:
                self.imports.append((spec, ["*"], node.start_point[0] + 1))
            return
        if fn.type != "member_expression" or not args.named_children:
            return
        prop = text(fn.child_by_field_name("property"))
        if prop not in ("from", "rpc"):
            return
        obj = fn.child_by_field_name("object")
        obj_text = text(obj)
        if obj_text in NOT_A_CLIENT or obj_text.endswith("storage") or obj_text.endswith(".schema"):
            return
        line = node.start_point[0] + 1
        names = enclosing_names(node)
        chain = call_chain(node) if prop == "from" else []
        writes = [m for m in chain if m in WRITE_OPS]
        op = writes[0] if writes else ("select" if "select" in chain else "query")
        for name in _table_names(args.named_children[0]):
            if prop == "rpc":
                self.rpc.append((names, name, line))
            else:
                self.db.append((names, name, op, line))

    def _import(self, node):
        source = node.child_by_field_name("source")
        spec = string_value(source) if source is not None else None
        if not spec:
            return
        names: list[str] = []
        for c in walk(node):
            if c.type == "import_specifier" or c.type == "export_specifier":
                names.append(text(c.child_by_field_name("name")))
            elif c.type in ("namespace_import", "namespace_export"):
                names.append("*")
            elif c.type == "import_clause":
                for cc in c.named_children:
                    if cc.type == "identifier":
                        names.append("default")
        if node.type == "export_statement" and not names:
            names.append("*")  # export * from
        self.imports.append((spec, names, node.start_point[0] + 1))


def url_in(value: str | None) -> str | None:
    """The path in a string that could address a route handler: "/api/x?y", `${origin}/api/x`."""
    if not value:
        return None
    if "/api/" in value:
        value = value[value.index("/api/"):]
    elif not value.startswith("/") or value.startswith("//") or len(value) < 3:
        return None
    url = re.split(r"[?#\s\"'`]", value)[0].rstrip("/")
    return url if re.fullmatch(r"(/[\w\-.*\[\]]+)+", url) else None


def _table_names(arg, depth: int = 0) -> list[str]:
    """`"t"`, `cond ? "a" : "b"`, or a const in scope holding either -> the names it can be."""
    if arg is None or depth > 3:
        return []
    if arg.type == "ternary_expression":
        branches = [arg.child_by_field_name("consequence"), arg.child_by_field_name("alternative")]
        return [n for b in branches for n in _table_names(b, depth + 1)]
    if arg.type in ("parenthesized_expression", "as_expression") and arg.named_children:
        return _table_names(arg.named_children[0], depth + 1)
    if arg.type == "identifier":
        return _table_names(_declared_value(arg), depth + 1)
    name = string_value(arg)
    return [name.lower()] if name and "*" not in name else []


def _declared_value(ident):
    """The initialiser of the nearest `const|let x = ...` in scope for identifier `x`."""
    name = text(ident)
    scope = ident.parent
    while scope is not None:
        if scope.type in ("statement_block", "program", "class_body"):
            for stmt in scope.named_children:
                if stmt.type == "export_statement" and stmt.named_children:
                    stmt = stmt.named_children[0]
                if stmt.type in ("lexical_declaration", "variable_declaration"):
                    for decl in stmt.named_children:
                        if decl.type == "variable_declarator" and text(decl.child_by_field_name("name")) == name:
                            return decl.child_by_field_name("value")
        scope = scope.parent
    return None


def _has_directive(root, directive: str) -> bool:
    for child in root.named_children:
        if child.type == "comment":
            continue
        return child.type == "expression_statement" and string_value(child.named_children[0]) == directive
    return False


def resolve_import(from_file: str, spec: str) -> str | None:
    if spec.startswith("@/"):
        base = spec[2:]
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    else:
        return None
    for cand in (base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"):
        if cand.endswith((".ts", ".tsx")) and (ROOT / cand).is_file():
            return cand
    return None


# ------------------------------------------------------------------ routes

def route_segments(path: str) -> list[str]:
    """app/[lang]/(shop)/shop/[id]/page.tsx -> ["shop", "[id]"]."""
    parts = path.split("/")[1:-1]
    return [p for p in parts if p != "[lang]" and not (p.startswith("(") and p.endswith(")"))]


def match_endpoint(url: str, routes: dict[tuple[str, ...], str]) -> str | None:
    segs = [s for s in url.strip("/").split("/") if s]
    best, best_score = None, -1
    for candidate in (segs, segs[1:]):  # `/${lang}/settings/...` -> /settings/...
        for pattern, path in sorted(routes.items()):
            score = _match(candidate, list(pattern))
            if score is not None and score > best_score:
                best, best_score = path, score
        if best:
            return best
    return None


def _match(segs: list[str], pattern: list[str]) -> int | None:
    score = 0
    for i, p in enumerate(pattern):
        if p.startswith("[...") or p.startswith("[[..."):
            return score if len(segs) > i or p.startswith("[[") else None
        if i >= len(segs):
            return None
        s = segs[i]
        if p.startswith("["):
            continue  # dynamic segment matches anything
        if s == "*" or s != p:
            return None
        score += 1
    return score if len(segs) == len(pattern) else None


# ------------------------------------------------------------------- build

class Builder:
    def __init__(self, graph: dict, index: Index):
        self.graph = graph
        self.index = index
        self.new_nodes: dict[str, dict] = {}
        self.edges: dict[frozenset, dict] = {}

    def node(self, nid, label, kind, source_file, line, community_of=None):
        if nid in self.new_nodes:
            return nid
        anchor = self.index.nodes.get(community_of) if community_of else None
        self.new_nodes[nid] = {
            "id": nid,
            "label": label,
            "_origin": ORIGIN,
            "community": anchor.get("community", -1) if anchor else -1,
            "community_name": anchor.get("community_name", "") if anchor else "",
            "file_type": "code",
            "_dataflow": kind,  # graphify uses node_kind itself ("page" = a markdown doc)
            "norm_label": label.lower(),
            "source_file": source_file,
            "source_location": f"L{line}",
        }
        return nid

    def edge(self, source, target, relation, context, source_file, line):
        if source is None or target is None or source == target:
            return
        key = frozenset((source, target))
        if key in self.index.connected:
            return  # graphify already links the pair; an undirected graph keeps one edge
        existing = self.edges.get(key)
        if existing is None:
            self.edges[key] = {
                "source": source, "target": target, "relation": relation,
                "_contexts": {context} if context else set(),
                "_origin": ORIGIN, "confidence": "EXTRACTED", "confidence_score": 1.0,
                "source_file": source_file, "source_location": f"L{line}", "weight": 1.0,
            }
            return
        if context:
            existing["_contexts"].add(context)
        if relation == "writes_to" and existing["relation"] == "reads_from":
            existing["relation"] = "writes_to"  # one edge per pair: a write outranks a read

    def finish(self):
        nodes = [self.new_nodes[k] for k in sorted(self.new_nodes)]
        links = []
        for e in sorted(self.edges.values(), key=lambda e: (e["source"], e["target"])):
            e = dict(e)
            ctx = sorted(e.pop("_contexts"))
            if ctx:
                e["context"] = ",".join(ctx)
            links.append(e)
        self.graph["nodes"].extend(nodes)
        self.graph["links"].extend(links)
        return nodes, links


def schema_targets(index: Index, builder: Builder, sql_files: list[str]) -> dict[str, str]:
    """Map table/view/function names to nodes, adding any graphify's SQL pass missed."""
    created: dict[str, tuple[str, int, str]] = {}
    create_re = re.compile(
        r"create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(table|view|function)\s+(?:if\s+not\s+exists\s+)?"
        r"(?:public\.)?\"?([a-z_][a-z0-9_]*)\"?",
        re.IGNORECASE,
    )
    for path in sql_files:
        sql = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        for m in create_re.finditer(sql):
            name = m.group(2).lower()
            line = sql.count("\n", 0, m.start()) + 1
            created[name] = (path, line, m.group(1).lower())  # later migrations win
    targets = dict(index.schema)
    for name, (path, line, kind) in sorted(created.items()):
        if name in targets:
            continue
        label = f"{name}()" if kind == "function" else name
        targets[name] = builder.node(
            f"dataflow_{kind}_{name}", label, kind, path, line, community_of=index.file_node.get(path)
        )
    return targets


def foreign_keys(index: Index, builder: Builder, targets: dict, sql_files: list[str]):
    table_re = re.compile(
        r"^\s*(?:create\s+table\s+(?:if\s+not\s+exists\s+)?|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?)"
        r"(?:public\.)?\"?([a-z_][a-z0-9_]*)\"?",
        re.IGNORECASE,
    )
    ref_re = re.compile(r"\breferences\s+(?:public\.)?\"?([a-z_][a-z0-9_]*)\"?", re.IGNORECASE)
    for path in sql_files:
        sql = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        body = re.sub(r"\$([a-z_]*)\$.*?\$\1\$", lambda m: "\n" * m.group(0).count("\n"), sql, flags=re.S | re.I)
        body = re.sub(r"--[^\n]*", "", body)
        offset = 0
        for stmt in body.split(";"):
            m = table_re.match(stmt)
            if m:
                src = targets.get(m.group(1).lower())
                for r in ref_re.finditer(stmt):
                    dst = targets.get(r.group(1).lower())
                    if src and dst:
                        line = body.count("\n", 0, offset + r.start()) + 1
                        builder.edge(src, dst, "references", "foreign_key", path, line)
            offset += len(stmt) + 1


def main(graph_path: Path) -> None:
    graph = load_graph(graph_path)
    index = Index(graph)
    builder = Builder(graph, index)

    sql_files = sorted(str(p.relative_to(ROOT)) for p in (ROOT / MIGRATIONS).glob("*.sql"))
    targets = schema_targets(index, builder, sql_files)
    foreign_keys(index, builder, targets, sql_files)

    ts_files = sorted(
        str(p.relative_to(ROOT))
        for d in SOURCE_DIRS if (ROOT / d).is_dir()
        for p in (ROOT / d).rglob("*")
        if p.suffix in (".ts", ".tsx") and "node_modules" not in p.parts and not p.name.endswith(".d.ts")
    )
    sources = {path: Source(path) for path in ts_files if not TEST_FILE.search(path)}

    # Endpoints: one node per route handler (app/**/route.ts), linked to its exported methods.
    routes: dict[tuple[str, ...], str] = {}
    endpoint_of: dict[str, str] = {}
    for path in ts_files:
        if path.startswith("app/") and re.search(r"/route\.tsx?$", path):
            segs = route_segments(path)
            url = "/" + "/".join(segs)
            routes[tuple(segs)] = path
            nid = builder.node(
                "dataflow_endpoint_" + re.sub(r"[^a-z0-9]+", "_", url.lower()).strip("_"),
                url, "endpoint", path, 1, community_of=index.file_node.get(path),
            )
            endpoint_of[path] = nid
            for method in HTTP_METHODS:
                handler = index.by_file_label.get((path, f"{method}()"))
                if handler:
                    builder.edge(nid, handler, "handled_by", method, path, _line(index.nodes[handler]))

    unresolved: dict[str, set[str]] = defaultdict(set)

    def data_edges(source_id: str, src: Source):
        for names, table, op, line in src.db:
            target = targets.get(table)
            if not target:
                unresolved["table"].add(table)
                continue
            rel = "writes_to" if op in WRITE_OPS else "reads_from"
            builder.edge(source_id or index.symbol(src.path, names), target, rel, op, src.path, line)
        for names, fn, line in src.rpc:
            target = targets.get(fn)
            if not target:
                unresolved["rpc"].add(fn)
                continue
            builder.edge(source_id or index.symbol(src.path, names), target, "calls_rpc", "rpc", src.path, line)
        for names, url, method, line in src.api:
            route = match_endpoint(url, routes)
            if not route:
                if url.startswith("/api/"):
                    unresolved["endpoint"].add(url)
                continue
            if route == src.path:
                continue
            source = source_id or index.symbol(src.path, names)
            builder.edge(source, endpoint_of[route], "requests", method, src.path, line)

    # Code in the graph: attribute each call to its enclosing function.
    for path, src in sources.items():
        if path in index.files_in_graph:
            data_edges("", src)

    # Functions that touch data, directly or through what they call.
    touches = {e["source"] for e in builder.edges.values() if e["relation"] in ("reads_from", "writes_to", "calls_rpc")}
    callers = defaultdict(set)
    for l in graph["links"]:
        if l.get("relation") in ("calls", "indirect_call"):
            callers[l["target"]].add(l["source"])
    frontier = list(touches)
    while frontier:
        nid = frontier.pop()
        for caller in callers.get(nid, ()):
            if caller not in touches:
                touches.add(caller)
                frontier.append(caller)

    # Pages: one node per route, carrying what its (out-of-graph) UI tree touches.
    for path in ts_files:
        if not (path.startswith("app/") and path.endswith("/page.tsx")):
            continue
        url = "/" + "/".join(route_segments(path))
        page = builder.node(
            "dataflow_page_" + (re.sub(r"[^a-z0-9]+", "_", url.lower()).strip("_") or "home"),
            url, "page", path, 1,
        )
        seen, queue = set(), [path]
        while queue:
            ui = queue.pop()
            if ui in seen or ui not in sources:
                continue
            seen.add(ui)
            src = sources[ui]
            data_edges(page, src)
            for spec, names, line in src.imports:
                dep = resolve_import(ui, spec)
                if not dep or TEST_FILE.search(dep):
                    continue
                if dep not in index.files_in_graph:
                    queue.append(dep)  # still UI: keep walking
                    continue
                dep_src = sources.get(dep)
                is_action = bool(dep_src and dep_src.use_server)
                for name in names:
                    target = index.symbol(dep, [] if name in ("*", "default") else [name])
                    if not target:
                        continue
                    if is_action and index.nodes[target].get("label", "").endswith("()"):
                        builder.edge(page, target, "uses_action", "server_action", ui, line)
                    elif target in touches:
                        builder.edge(page, target, "loads", "import", ui, line)
        page_edges = [e for e in builder.edges.values() if e["source"] == page]
        if not page_edges:
            del builder.new_nodes[page]  # touches no data: nothing to add over the UI it stands for
            continue
        # A page sits in the community most of its data lives in.
        votes = defaultdict(int)
        for e in page_edges:
            if e["target"] in index.nodes:
                votes[index.nodes[e["target"]].get("community_name", "")] += 1
        if votes:
            name = min(votes, key=lambda k: (-votes[k], k))
            anchor = next(n for n in index.nodes.values() if n.get("community_name") == name)
            builder.new_nodes[page]["community"] = anchor.get("community", -1)
            builder.new_nodes[page]["community_name"] = name

    nodes, links = builder.finish()
    graph_path.write_text(json.dumps(graph, indent=2) + "\n", encoding="utf-8")
    write_report(graph_path.parent / "DATA_LAYER.md", graph, unresolved)
    counts = defaultdict(int)
    for l in links:
        counts[l["relation"]] += 1
    summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items()))
    print(f"[graphify-dataflow] +{len(nodes)} nodes, +{len(links)} edges ({summary})")


# ------------------------------------------------------------------ report

REACH_RELATIONS = {"uses_action", "loads", "requests", "handled_by", "calls", "indirect_call"}
REACH_DEPTH = 6  # page -> endpoint -> handler -> four levels of calls (five below an action)


def page_reach(graph: dict, by_id: dict, schema_ids: set) -> dict[str, tuple[set, set]]:
    """Tables each page can write and read, following its actions, endpoints and their calls."""
    follow = defaultdict(list)
    data = defaultdict(list)
    for l in graph["links"]:
        if l["relation"] in REACH_RELATIONS:
            follow[l["source"]].append(l["target"])
        elif l.get("_origin") == ORIGIN and l["relation"] in ("reads_from", "writes_to") and l["target"] in schema_ids:
            data[l["source"]].append((l["relation"], l["target"]))
    reach = {}
    for page in (nid for nid, n in by_id.items() if n.get("_dataflow") == "page"):
        writes, reads, seen, frontier = set(), set(), {page}, [page]
        for _ in range(REACH_DEPTH + 1):
            nxt = []
            for nid in frontier:
                for rel, table in data.get(nid, ()):
                    (writes if rel == "writes_to" else reads).add(table)
                for dep in follow.get(nid, ()):
                    if dep not in seen:
                        seen.add(dep)
                        nxt.append(dep)
            frontier = nxt
        reach[page] = (writes, reads)
    return reach


def write_report(path: Path, graph: dict, unresolved: dict) -> None:
    by_id = {n["id"]: n for n in graph["nodes"]}

    def where(e: dict) -> str:
        return f"{e['source_file']}:{e['source_location'][1:]}"

    schema_ids = {nid for nid, n in by_id.items() if (n.get("source_file") or "").startswith(MIGRATIONS + "/")}
    per_table = defaultdict(lambda: defaultdict(list))
    per_page = defaultdict(lambda: defaultdict(list))
    fks = defaultdict(set)
    for l in graph["links"]:
        rel, s, t = l["relation"], l["source"], l["target"]
        if rel == "references" and s in schema_ids and t in schema_ids and s != t:
            fks[s].add(t)
        if l.get("_origin") != ORIGIN:
            continue
        if rel in ("reads_from", "writes_to", "calls_rpc") and t in schema_ids:
            per_table[t][rel].append((s, l))
        if by_id[s].get("_dataflow") == "page":
            per_page[s][rel].append((t, l))

    reach = page_reach(graph, by_id, schema_ids)
    written_from = defaultdict(set)
    for page, (writes, _reads) in reach.items():
        for t in writes:
            written_from[t].add(by_id[page]["label"])

    out = [
        "# Data layer",
        "",
        "Generated by `scripts/graphify-dataflow.py` on every `./scripts/graphify update` — do not edit.",
        "Which code reads and writes each table, and what each page touches. The same edges are in",
        "`graph.json` (`_origin: \"dataflow\"`), so `./scripts/graphify explain \"<table>\"` shows them too.",
        "The narrative flows (stock in, purchases out) are in `docs/data-flows/`.",
        "",
        "Relations: `writes_to` (insert/update/upsert/delete), `reads_from` (select), `calls_rpc`,",
        "`requests` (a route handler's URL in the source), `uses_action` (server action), `loads` (a",
        "data function a page's UI imports), `references` (foreign key).",
        "",
        "\"Changed from pages\" and a page's \"Changes ... / Reads ...\" lines follow actions, endpoints",
        f"and static calls, at most {REACH_DEPTH} hops from the page. They over-include shared helpers",
        "(auth, audit log) and miss calls made through variables; confirm against the direct edges",
        "before relying on one.",
        "",
        "## Tables",
        "",
    ]
    for t in sorted(per_table, key=lambda t: by_id[t]["label"]):
        n = by_id[t]
        out.append(f"### {schema_name(n['label']) or n['label']}")
        out.append(f"Defined in {n.get('source_file')}:{n.get('source_location', 'L1')[1:]}")
        if fks.get(t):
            out.append("References: " + ", ".join(sorted(f"`{schema_name(by_id[x]['label'])}`" for x in fks[t])))
        if written_from.get(t):
            out.append("Changed from pages: " + ", ".join(f"`{x}`" for x in sorted(written_from[t])))
        for rel, heading in (("writes_to", "Written by"), ("calls_rpc", "Called by"), ("reads_from", "Read by")):
            rows = sorted(per_table[t].get(rel, []), key=lambda r: (by_id[r[0]]["label"], where(r[1])))
            if rows:
                out.append(f"- {heading}:")
                for s, l in rows:
                    ctx = f" [{l['context']}]" if l.get("context") and rel != "calls_rpc" else ""
                    label = by_id[s]["label"]
                    kind = " (page)" if by_id[s].get("_dataflow") == "page" else ""
                    out.append(f"  - `{label}`{kind}{ctx} — {where(l)}")
        out.append("")

    out += ["## Pages", "", "Each `app/**/page.tsx` route and the data its component tree touches.", ""]
    for p in sorted(per_page, key=lambda p: by_id[p]["label"]):
        out.append(f"### {by_id[p]['label']}")
        out.append(f"{by_id[p]['source_file']}")
        for rel, heading in (("uses_action", "Server actions"), ("requests", "Endpoints"), ("loads", "Loads"),
                             ("writes_to", "Writes"), ("reads_from", "Reads"), ("calls_rpc", "RPC")):
            rows = sorted({by_id[t]["label"] + (f" [{l['context']}]" if rel == "requests" and l.get("context") else "")
                           for t, l in per_page[p].get(rel, [])})
            if rows:
                out.append(f"- {heading}: " + ", ".join(f"`{r}`" for r in rows))
        writes, reads = reach.get(p, (set(), set()))
        name = lambda t: schema_name(by_id[t]["label"]) or by_id[t]["label"]
        if writes:
            out.append("- Changes, through its actions, endpoints and their calls: "
                       + ", ".join(f"`{x}`" for x in sorted({name(t) for t in writes})))
        if reads - writes:
            out.append("- Reads, through the same: "
                       + ", ".join(f"`{x}`" for x in sorted({name(t) for t in reads - writes})))
        out.append("")

    if any(unresolved.values()):
        out += ["## Unresolved", "", "Names in the source with no matching table, function or route (dynamic,",
                "external, or a typo).", ""]
        for kind in sorted(unresolved):
            out.append(f"- {kind}: " + ", ".join(f"`{x}`" for x in sorted(unresolved[kind])))
        out.append("")

    path.write_text("\n".join(out), encoding="utf-8")


def strip(graph_path: Path) -> None:
    """Remove this pass's nodes and edges, leaving the graph exactly as graphify built it."""
    graph = load_graph(graph_path)
    graph_path.write_text(json.dumps(graph, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    args = sys.argv[1:]
    stripping = args[:1] == ["--strip"]
    if stripping:
        args = args[1:]
    target = Path(args[0] if args else "graphify-out/graph.json")
    ROOT = target.resolve().parent.parent
    if stripping:
        strip(target)
    else:
        main(target)
