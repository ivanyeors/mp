// Unit tests for the local `mp` rules, run through ESLint's RuleTester with
// the TypeScript parser so JSX and TS syntax parse as they do in the repo.
// typescript-eslint is not a direct dependency; its parser comes from the
// eslint-config-next/typescript config the repo already loads.
import { RuleTester } from "eslint";
import nextTs from "eslint-config-next/typescript";
import { describe, it } from "vitest";
import noComment from "./no-comment.mjs";
import noEffect from "./no-effect.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const parser = nextTs.find((config) => config.languageOptions?.parser)?.languageOptions?.parser;

const tester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const effect = (line: number, name = "useEffect") => ({ messageId: "effect", line, data: { name } });
const alias = (line: number, name: string) => effect(line, `${name} (an alias of an effect hook)`);

tester.run("mp/no-effect", noEffect, {
  valid: [
    "useMemo(() => 1, []);",
    "useSyncExternalStore(subscribe, getSnapshot);",
    "const useEffectLike = 1; useEffectLike;",
    'const k = "use" + "Effect"; obj[k];',
    'const s = "useEffect is mentioned in a string";',
  ],
  invalid: [
    { code: "useEffect(() => {}, []);", errors: [effect(1)] },
    { code: "useLayoutEffect(() => {});", errors: [effect(1, "useLayoutEffect")] },
    { code: "useInsertionEffect(() => {});", errors: [effect(1, "useInsertionEffect")] },
    { code: "React.useEffect(() => {}, []);", errors: [effect(1)] },
    {
      code: 'import { useEffect } from "react";\nuseEffect(() => {});',
      errors: [effect(1), effect(2)],
    },
    {
      code: 'import { useEffect as onMount } from "react";\nonMount(() => {});',
      errors: [effect(1), alias(2, "onMount")],
    },
    {
      code: "const onMount = useEffect;\nonMount(() => {}, []);",
      errors: [effect(1), alias(2, "onMount")],
    },
    {
      code: "const onMount = React.useEffect;\nconst again = onMount;\nagain(() => {});",
      errors: [effect(1), alias(2, "onMount"), alias(3, "again")],
    },
    {
      code: "const { useEffect: onMount } = React;\nonMount(() => {}, []);",
      errors: [effect(1), alias(2, "onMount")],
    },
    { code: 'React["useEffect"](() => {}, []);', errors: [effect(1)] },
    { code: "React[`useLayoutEffect`](() => {});", errors: [effect(1, "useLayoutEffect")] },
    { code: "(0, useEffect)(() => {}, []);", errors: [effect(1)] },
    { code: "useEffect.call(null, () => {}, []);", errors: [effect(1)] },
    { code: "useEffect!(() => {}, []);", errors: [effect(1)] },
    { code: "(useEffect as typeof useEffect)(() => {}, []);", errors: [effect(1), effect(1)] },
    {
      code: 'function C() {\n  onMount(() => {});\n}\nimport { useEffect as onMount } from "react";',
      errors: [alias(2, "onMount"), effect(4)],
    },
    { code: 'export { useEffect as useOnChange } from "react";', errors: [effect(1)] },
    { code: 'export * from "react";', errors: [effect(1, 'export * from "react"')] },
    {
      code: 'import { useIsomorphicLayoutEffect } from "framer-motion";\nuseIsomorphicLayoutEffect(() => {});',
      errors: [effect(1, "useIsomorphicLayoutEffect"), effect(2, "useIsomorphicLayoutEffect")],
    },
    {
      code: 'import { useImmediateEffect, useOnValueChange, useOnElementChange } from "@dnd-kit/react/hooks";',
      errors: [effect(1, "useImmediateEffect"), effect(1, "useOnValueChange"), effect(1, "useOnElementChange")],
    },
    { code: 'import { useUnmountEffect } from "framer-motion";', errors: [effect(1, "useUnmountEffect")] },
  ],
});

const line = (n: number) => ({ messageId: "comment", line: n });

tester.run("mp/no-comment", noComment, {
  valid: [
    "const a = 1;",
    "// ponytail: linear scan, fine below 1,000 rows; index it past that\nconst a = 1;",
    "// ponytail: one shortcut\n// two\n// three\n// four lines is the limit\nconst a = 1;",
    "/** ponytail: JSDoc-style shortcut note */\nconst a = 1;",
    { code: "// @vitest-environment jsdom\nconst a = 1;", filename: "lib/x.test.ts" },
    { code: "// @vitest-environment happy-dom\nconst a = 1;", filename: "components/x.spec.tsx" },
    'readFileSync(/*turbopackIgnore: true*/ path, "utf8");',
    '"use client";\nconst a = 1;',
    '"use server";\nexport async function f() {}',
    'export async function f() {\n  "use cache: remote";\n}',
  ],
  invalid: [
    { code: "// a note\nconst a = 1;", errors: [line(1)] },
    { code: "// one run\n// of three\n// line comments\nconst a = 1;", errors: [line(1), line(2), line(3)] },
    { code: "/**\n * JSDoc is a comment,\n * counted per line\n */\nexport function f() {}", errors: [line(1), line(2), line(3), line(4)] },
    { code: "const el = <div>{/* a JSX comment */}</div>;", errors: [line(1)] },
    { code: "const el = (\n  <div>\n    {/* two\n        lines */}\n  </div>\n);", errors: [line(3), line(4)] },
    { code: "const a = 1; // trailing\nconst b = 2; // trailing\n", errors: [line(1), line(2)] },
    {
      code: "// ponytail: one\n// two\n// three\n// four\n// five is past the limit\n// six\nconst a = 1;",
      errors: [line(5), line(6)],
    },
    {
      code: "/* ponytail: one\n   two\n   three\n   four\n   five */\nconst a = 1;",
      errors: [line(5)],
    },
    { code: "// note: ponytail: not at the start\nconst a = 1;", errors: [line(1)] },
    { code: "// eslint-disable-next-line no-console\nconsole.log(1);", errors: [line(1)] },
    { code: "// @ts-expect-error not a directive this codebase uses\nconst a: number = '';", errors: [line(1)] },
    { code: "/* webpackIgnore: true */\nconst a = 1;", errors: [line(1)] },
    {
      code: "// @vitest-environment mount_only_the_link_opens_once\nconst a = 1;",
      filename: "lib/x.test.ts",
      errors: [line(1)],
    },
    { code: "// @vitest-environment jsdom\nconst a = 1;", filename: "lib/x.ts", errors: [line(1)] },
    { code: "const a = 1;\n// @vitest-environment jsdom", filename: "lib/x.test.ts", errors: [line(2)] },
    { code: "// a note\n// @vitest-environment jsdom\nconst a = 1;", filename: "lib/x.test.ts", errors: [line(1), line(2)] },
    { code: "#! reloads on identity params only\nconst a = 1;", errors: [line(1)] },
    { code: '"mount-only: the link opens once";\nconst a = 1;', errors: [{ messageId: "string", line: 1 }] },
    { code: "function f() {\n  `a template note`;\n}", errors: [{ messageId: "string", line: 2 }] },
    { code: 'const a = 1;\n"use client";', errors: [{ messageId: "string", line: 2 }] },
  ],
});
