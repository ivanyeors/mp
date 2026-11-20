// mp/no-effect: effects are banned in product code (agent-rails PRD,
// decision 3). They live in hooks/ (the sanctioned wrappers) and
// components/ui/ (vendored primitives); eslint.config.mjs scopes the rule.
//
// It reports every mention of an effect hook, not only calls, so no
// spelling gets one past: an import or export specifier (any source), a
// member property (`React.useEffect`, `React["useEffect"]`), a destructuring
// key, a plain reference (`const onMount = useEffect`, `(0, useEffect)()`,
// `useEffect.call()`, `useEffect!()`), and every read of a local name bound
// to one of those. Aliases are resolved through the scope manager at
// Program:exit, so declaration order does not matter. `export * from
// "react"` is reported as well. One report per occurrence: a file that
// imports useEffect and calls it twice counts 3.
//
// Besides React's three, the names include the effect hooks that installed
// packages export under other names (surveyed 2026-11-20 in node_modules):
// framer-motion's useIsomorphicLayoutEffect and useUnmountEffect, and
// @dnd-kit/react/hooks' useIsomorphicLayoutEffect, useImmediateEffect,
// useOnValueChange and useOnElementChange.
//
// What still gets through: a name built at run time (`React["use" + x]`,
// `Reflect.get(React, k)`); and a module elsewhere that wraps an effect and
// is imported here, unless that module is itself linted by this rule (a
// re-export there is reported there).

const EFFECTS = new Set([
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useIsomorphicLayoutEffect",
  "useImmediateEffect",
  "useUnmountEffect",
  "useOnValueChange",
  "useOnElementChange",
]);

// `export * from` one of these re-exports effect hooks under their own names.
const EFFECT_SOURCES = new Set(["react", "framer-motion", "@dnd-kit/react/hooks"]);

const MESSAGE =
  "{{name}} is not allowed outside hooks/. Instead: derive the value while rendering; " +
  "do the work in the event handler that causes it; load data in a Server Component, loader or server action; " +
  "subscribe to an outside source with useSyncExternalStore; reset state by giving the component a `key`; " +
  "attach to a DOM node with a ref callback (React 19 runs its cleanup). " +
  "If none fits, use or add a hook in hooks/, the only place effects live.";

function staticName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

// Strip the wrappers that leave a value unchanged: `(x as T)`, `x!`,
// `x satisfies T`, `(a, x)`, `x?.y` chains.
function unwrap(node) {
  let n = node;
  for (;;) {
    if (!n) return n;
    if (n.type === "TSAsExpression" || n.type === "TSNonNullExpression" || n.type === "TSSatisfiesExpression" || n.type === "TSTypeAssertion") n = n.expression;
    else if (n.type === "SequenceExpression") n = n.expressions.at(-1);
    else if (n.type === "ChainExpression") n = n.expression;
    else return n;
  }
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow useEffect and other effect hooks outside hooks/" },
    schema: [],
    messages: { effect: MESSAGE },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const reported = new Set();
    const report = (node, name) => {
      const key = `${node.range[0]}:${node.range[1]}`;
      if (reported.has(key)) return;
      reported.add(key);
      context.report({ node, messageId: "effect", data: { name } });
    };

    return {
      Identifier(node) {
        if (EFFECTS.has(node.name)) report(node, node.name);
      },
      Literal(node) {
        const p = node.parent;
        const keyed =
          (p.type === "MemberExpression" && p.computed && p.property === node) ||
          (p.type === "Property" && p.key === node) ||
          p.type === "ImportSpecifier" ||
          p.type === "ExportSpecifier";
        if (keyed && EFFECTS.has(node.value)) report(node, node.value);
      },
      TemplateLiteral(node) {
        const p = node.parent;
        if (p.type === "MemberExpression" && p.computed && p.property === node) {
          const name = staticName(node);
          if (EFFECTS.has(name)) report(node, name);
        }
      },
      ExportAllDeclaration(node) {
        if (EFFECT_SOURCES.has(node.source.value)) report(node, `export * from "${node.source.value}"`);
      },
      "Program:exit"(program) {
        // Effect values: an effect name, a member read of one, or a variable
        // already known to hold one.
        const tainted = new Set();
        const holdsEffect = (expr) => {
          const n = unwrap(expr);
          if (!n) return false;
          if (n.type === "Identifier") {
            if (EFFECTS.has(n.name)) return true;
            const v = findVariable(n);
            return v ? tainted.has(v) : false;
          }
          if (n.type === "MemberExpression") return EFFECTS.has(n.computed ? staticName(n.property) : n.property.name);
          return false;
        };
        const findVariable = (id) => {
          for (let scope = sourceCode.getScope(id); scope; scope = scope.upper) {
            const v = scope.set.get(id.name);
            if (v) return v;
          }
          return null;
        };

        const variables = [];
        const collect = (scope) => {
          variables.push(...scope.variables);
          scope.childScopes.forEach(collect);
        };
        collect(sourceCode.getScope(program));

        const isTaintedDef = (variable) =>
          variable.defs.some((def) => {
            const id = def.name;
            const p = id.parent;
            if (def.type === "ImportBinding") {
              return p.type === "ImportSpecifier" && EFFECTS.has(staticName(p.imported));
            }
            if (p.type === "VariableDeclarator" && p.id === id) return holdsEffect(p.init);
            if (p.type === "Property" && p.value === id && p.parent.type === "ObjectPattern") {
              return EFFECTS.has(p.computed ? staticName(p.key) : staticName(p.key));
            }
            if (p.type === "AssignmentPattern" && p.left === id) return holdsEffect(p.right);
            return false;
          }) ||
          variable.references.some((ref) => ref.isWrite() && ref.writeExpr && ref.writeExpr !== ref.identifier && holdsEffect(ref.writeExpr));

        for (let grew = true; grew; ) {
          grew = false;
          for (const v of variables) {
            if (!tainted.has(v) && isTaintedDef(v)) {
              tainted.add(v);
              grew = true;
            }
          }
        }

        for (const v of tainted) {
          for (const ref of v.references) {
            if (ref.isRead()) report(ref.identifier, `${ref.identifier.name} (an alias of an effect hook)`);
          }
        }
      },
    };
  },
};

export default rule;
