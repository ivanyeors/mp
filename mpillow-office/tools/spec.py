"""
Load a plan spec (plans/<name>.yaml) -- the data half of the massing model.

A spec holds no code, but every number in it can be a small arithmetic
expression over named values, so a dimension is written once and everything
derived from it follows:

    vars:
      width: 7.90
      x_patio: overall_len - patio_len
    items:
      - {name: wall_north, x: [0, x_patio], z: [width, width + wall_t], y: [0, ceiling]}

Expressions are a safe subset of Python: numbers, names, + - * / // % **,
comparisons, and / or / not, a if c else b, [lists], (tuples), x[i], and the
functions in FUNCS. Anything else is rejected before it runs.
"""

import ast
import math
import os

import yaml

FUNCS = {
    "range": range, "len": len, "int": int, "float": float, "round": round,
    "abs": abs, "min": min, "max": max, "sum": sum,
    "cos": math.cos, "sin": math.sin, "atan2": math.atan2, "hypot": math.hypot,
    "sqrt": math.sqrt, "radians": math.radians,
}
CONSTS = {"pi": math.pi, "INF": 1e3}

_ALLOWED = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp,
    ast.Name, ast.Load, ast.Constant, ast.Call, ast.Subscript, ast.Tuple, ast.List,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.USub, ast.UAdd, ast.Not, ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
)
_CACHE = {}


class SpecError(ValueError):
    pass


def ev(value, env):
    """Evaluate a spec value: strings are expressions, lists recurse, numbers pass."""
    if isinstance(value, str):
        code = _CACHE.get(value)
        if code is None:
            try:
                tree = ast.parse(value.strip(), mode="eval")
            except SyntaxError as e:
                raise SpecError("bad expression %r: %s" % (value, e.msg))
            for node in ast.walk(tree):
                if not isinstance(node, _ALLOWED):
                    raise SpecError("not allowed in %r: %s" % (value, type(node).__name__))
                if isinstance(node, ast.Call) and not (
                        isinstance(node.func, ast.Name) and node.func.id in FUNCS):
                    raise SpecError("unknown function in %r" % value)
            code = _CACHE[value] = compile(tree, "<spec>", "eval")
        try:
            return eval(code, {"__builtins__": {}}, _Scope(env))
        except NameError as e:
            raise SpecError("%s (in %r)" % (e, value))
    if isinstance(value, list):
        return [ev(v, env) for v in value]
    return value


class _Scope(dict):
    def __init__(self, env):
        super().__init__()
        self.env = env

    def __missing__(self, key):
        for d in (self.env, FUNCS, CONSTS):
            if key in d:
                return d[key]
        raise NameError("unknown name %r" % key)


def bind(block, env):
    """Evaluate an ordered {name: expr} block into a copy of env (later names see earlier ones)."""
    env = dict(env)
    for k, v in (block or {}).items():
        env[k] = ev(v, env)
    return env


def expand(item, env):
    """Yield (item, env) once per combination of the item's `for` loops, outer loop
    first, with `let` bound and `if` applied."""
    loops = list((item.get("for") or {}).items())

    def walk(i, env):
        if i == len(loops):
            env = bind(item.get("let"), env)
            if "if" not in item or ev(item["if"], env):
                yield env
            return
        name, it = loops[i]
        for v in ev(it, env):
            yield from walk(i + 1, dict(env, **{name: v}))

    yield from walk(0, env)


def load(path):
    path = os.path.abspath(path)
    with open(path, encoding="utf-8") as f:
        spec = yaml.safe_load(f)
    for key in ("name", "items"):
        if key not in spec:
            raise SpecError("%s: missing '%s'" % (path, key))
    spec["_path"] = path
    spec["_dir"] = os.path.dirname(path)
    spec["_env"] = bind(spec.get("vars"), {})
    return spec


def resolve_path(spec, p):
    """Paths in a spec are relative to the spec file."""
    return p if os.path.isabs(p) else os.path.normpath(os.path.join(spec["_dir"], p))
