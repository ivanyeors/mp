import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SERVER_ONLY_PACKAGE = "@anthropic-ai/sdk";
const SOURCE_DIRS = ["app", "components", "hooks", "lib"];
const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|check)\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  return null;
}

const onlyTypes = (names: string) => {
  const inner = names.trim().match(/^\{([^}]*)\}$/s)?.[1];
  return inner !== undefined && inner.split(",").map((n) => n.trim()).filter(Boolean).every((n) => n.startsWith("type "));
};

function staticImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  for (const m of src.matchAll(IMPORT)) {
    if (m[1] || (m[2] && onlyTypes(m[2]))) continue;
    specs.push(m[3] ?? m[4]);
  }
  return specs;
}

function pathToServerOnly(entry: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const spec of staticImports(file)) {
      if (spec === SERVER_ONLY_PACKAGE || spec.startsWith(`${SERVER_ONLY_PACKAGE}/`)) {
        const chain = [spec];
        for (let at: string | null = file; at; at = parent.get(at) ?? null) chain.unshift(path.relative(ROOT, at));
        return chain;
      }
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      const next = resolveLocal(file, spec);
      if (!next || parent.has(next)) continue;
      parent.set(next, file);
      queue.push(next);
    }
  }
  return null;
}

const clientEntries = SOURCE_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d))).filter((f) =>
  /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
);
assert.ok(clientEntries.length > 100, `found only ${clientEntries.length} client components; the scan is broken`);

const leaks = clientEntries.map(pathToServerOnly).filter((chain): chain is string[] => chain !== null);
assert.deepEqual(
  leaks.map((chain) => chain.join("\n  -> ")),
  [],
  `${SERVER_ONLY_PACKAGE} is reachable from browser code, which ships the SDK to every visitor of that page. Import client-safe constants from a module that does not import it.`,
);

console.log(`claude-stays-on-server: ${clientEntries.length} client components checked, none import ${SERVER_ONLY_PACKAGE}`);
