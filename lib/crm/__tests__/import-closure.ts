import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export function importClosure(entries: readonly string[], root = process.cwd()): string[] {
  const seen = new Set<string>();
  const queue = entries.map((e) => resolve(root, e));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      const target = spec.startsWith("@/")
        ? resolveFile(join(root, spec.slice(2)))
        : spec.startsWith(".")
          ? resolveFile(resolve(dirname(file), spec))
          : null;
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].map((f) => relative(root, f)).sort();
}

function specifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

function resolveFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

export function codeOf(file: string, root = process.cwd()): string {
  return readFileSync(resolve(root, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
