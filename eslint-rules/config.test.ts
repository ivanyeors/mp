// The real eslint.config.mjs, through the ESLint class: each rail is on where
// the PRD says and off where it says. lintText does not read
// eslint-suppressions.json, so these see the rules as a new file would.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root });

async function lint(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return result.messages;
}
const rules = async (filePath: string, code: string) => (await lint(filePath, code)).map((m) => m.ruleId);

const effect = 'import { useEffect } from "react";\nexport function useX() {\n  useEffect(() => {}, []);\n}\n';
const comment = "// a note\nexport const a = 1;\n";
const shopify = 'import { getShopifyEnv } from "@/lib/shopify/env";\nexport const env = getShopifyEnv;\n';
const importFrom = (from: string) => `import x from "${from}";\nexport default x;\n`;

describe("mp/no-effect in the config", () => {
  it("reports useEffect in components/ with a message that says what to do instead", async () => {
    const messages = (await lint("components/x.tsx", effect)).filter((m) => m.ruleId === "mp/no-effect");
    expect(messages.map((m) => [m.line, m.severity])).toEqual([[1, 2], [3, 2]]);
    const text = messages[0].message;
    for (const phrase of [
      "not allowed outside hooks/",
      "derive the value while rendering",
      "event handler",
      "Server Component, loader or server action",
      "useSyncExternalStore",
      "`key`",
      "ref callback",
      "add a hook in hooks/, the only place effects live",
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("is off in hooks/ and components/ui/ only", async () => {
    expect(await rules("hooks/x.ts", effect)).not.toContain("mp/no-effect");
    expect(await rules("components/ui/x.tsx", effect)).not.toContain("mp/no-effect");
  });

  it("covers a new root folder, a new root file and public/sw.js", async () => {
    for (const file of ["features/x.tsx", "x.tsx", "public/sw.js"]) {
      expect(await rules(file, effect), file).toContain("mp/no-effect");
    }
  });

  it("reports the aliases and lookalikes an agent might reach for", async () => {
    const code = [
      'import React from "react";',
      'import { useIsomorphicLayoutEffect } from "framer-motion";',
      "export function C() {",
      "  onLater(() => {});",
      '  React["useEffect"](() => {});',
      "  (0, useLayoutEffect)(() => {});",
      "  useIsomorphicLayoutEffect(() => {});",
      "  return null;",
      "}",
      'import { useLayoutEffect, useEffect as onLater } from "react";',
    ].join("\n");
    const lines = (await lint("components/x.tsx", code)).filter((m) => m.ruleId === "mp/no-effect").map((m) => m.line);
    expect(lines).toEqual([2, 4, 5, 6, 7, 10, 10]);
  });

  it("reports a re-export from react", async () => {
    expect(await rules("lib/x.ts", 'export { useEffect as useOnChange } from "react";\n')).toContain("mp/no-effect");
    expect(await rules("lib/x.ts", 'export * from "react";\n')).toContain("mp/no-effect");
  });
});

describe("mp/no-comment in the config", () => {
  it("reports a comment in lib/ with a message that says where the reason goes", async () => {
    const [message] = (await lint("lib/x.ts", comment)).filter((m) => m.ruleId === "mp/no-comment");
    expect(message.severity).toBe(2);
    for (const phrase of ["a clearer name", "a type", "a test", "*.check.ts", "`ponytail:`", "ceiling and the upgrade path"]) {
      expect(message.message).toContain(phrase);
    }
  });

  it("counts a line added under an existing comment", async () => {
    const one = await rules("lib/x.ts", "// a note\nexport const a = 1;\n");
    const two = await rules("lib/x.ts", "// a note\n// and one more line\nexport const a = 1;\n");
    expect(two.filter((r) => r === "mp/no-comment").length).toBe(one.filter((r) => r === "mp/no-comment").length + 1);
  });

  it("covers a new root folder, a new root file, hooks/ and tests", async () => {
    for (const file of ["features/x.tsx", "x.ts", "hooks/x.ts", "lib/__tests__/x.test.ts"]) {
      expect(await rules(file, comment), file).toContain("mp/no-comment");
    }
  });

  it("is off in components/ui/, the generated silhouette-master.ts and tooling", async () => {
    for (const file of [
      "components/ui/x.tsx",
      "lib/spatial-fillings/silhouette-master.ts",
      "scripts/x.ts",
      ".claude/hooks/x.mjs",
      "eslint-rules/x.mjs",
      "next.config.ts",
    ]) {
      expect(await rules(file, comment), file).not.toContain("mp/no-comment");
    }
  });
});

describe("no inline config", () => {
  it("an eslint-disable-next-line aimed at a reported line changes nothing", async () => {
    const code = 'import { useEffect } from "react";\nexport function useX() {\n  // eslint-disable-next-line mp/no-effect\n  useEffect(() => {}, []);\n}\n';
    const messages = await lint("components/x.tsx", code);
    expect(messages.filter((m) => m.ruleId === "mp/no-effect").map((m) => m.line)).toEqual([1, 4]);
    expect(messages.some((m) => m.ruleId === null && m.message.includes("noInlineConfig"))).toBe(true);
  });
});

describe("Shopify and scripts/ imports in the config", () => {
  it("reports a Shopify import in lib/ with the CLAUDE.md reason", async () => {
    const [message] = (await lint("lib/x.ts", shopify)).filter((m) => m.ruleId === "no-restricted-imports");
    expect(message.severity).toBe(2);
    expect(message.message).toContain("Nothing new integrates with Shopify");
    expect(message.message).toContain("ADR 0029");
  });

  it("is off in Shopify's own folders and scripts/", async () => {
    for (const file of ["lib/shopify/x.ts", "app/api/shopify/x/route.ts", "app/api/cron/shopify-order-mirror-catchup/route.ts", "scripts/x.ts"]) {
      expect(await rules(file, shopify), file).not.toContain("no-restricted-imports");
    }
  });

  it("still bans Shopify in tooling", async () => {
    expect(await rules(".claude/hooks/x.mjs", shopify)).toContain("no-restricted-imports");
  });

  it("reports every spelling that reaches a shopify folder, and not its neighbours", async () => {
    for (const from of [
      "@shopify/shopify-api",
      "@/lib/./shopify/client",
      "../inventory/../shopify/client",
      "../../lib/shopify/client",
      "@/app/api/shopify/sync/route",
    ]) {
      expect(await rules("lib/inventory/x.ts", importFrom(from)), from).toContain("no-restricted-imports");
    }
    for (const from of ["@/lib/shopify-redirects", "./shopify-csv"]) {
      expect(await rules("lib/customer-migration/x.ts", importFrom(from)), from).not.toContain("no-restricted-imports");
    }
  });

  it("reports dynamic import() and require() of Shopify", async () => {
    for (const code of [
      'export const m = () => import("@/lib/shopify/client");\n',
      'export const m = () => import("@shopify/shopify-api");\n',
      "export const m = (n: string) => import(`@/lib/shopify/${n}`);\n",
      'export const m = () => require("@/lib/shopify/env");\n',
    ]) {
      expect(await rules("lib/x.ts", code), code).toContain("no-restricted-syntax");
    }
  });

  it("bans product code, Shopify's folders included, from importing scripts/", async () => {
    for (const file of ["lib/x.ts", "lib/shopify/x.ts"]) {
      const messages = (await lint(file, importFrom("@/scripts/shopify-bridge"))).filter((m) => m.ruleId === "no-restricted-imports");
      expect(messages.map((m) => m.message).join(), file).toContain("does not import from scripts/");
    }
    expect(await rules("lib/x.ts", 'export const m = () => import("@/scripts/x");\n')).toContain("no-restricted-syntax");
    expect(await rules(".claude/hooks/x.mjs", importFrom("../../scripts/x.mjs"))).not.toContain("no-restricted-imports");
  });
});

describe("severities", () => {
  it("sets no rule to warn", async () => {
    for (const file of ["components/x.tsx", "lib/x.ts", "scripts/x.mjs"]) {
      const config = await eslint.calculateConfigForFile(path.join(root, file));
      const warns = Object.entries(config.rules ?? {}).filter(([, v]) => (Array.isArray(v) ? v[0] : v) === 1);
      expect(warns, file).toEqual([]);
      expect(config.linterOptions.reportUnusedDisableDirectives, file).toBe(2);
    }
  });
});
