import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ponytail: recursive readdir instead of fs.globSync — globSync is a Node 22
// runtime API but is absent from the project's @types/node, which breaks tsc.
function walkTsx(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTsx(full));
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const SCAN_DIRS = ["components/shop", "app/[lang]/shop"];

const SMALL_TEXT = /\btext-(sm|xs|\[1[0-5]px\])\b/;
const COMPANION = /\bmax-md:text-base\b/;

const OPEN_TAG = /<(input|textarea|Input|Textarea)\b/;
const NON_TEXT_TYPE = /type=["'](radio|checkbox|range|color|file|button|submit|reset|hidden|image)["']/;

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const abs of walkTsx(join(ROOT, dir))) files.push(relative(ROOT, abs));
  }
  return files;
}

function elementBlocks(src: string): string[] {
  const lines = src.split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN_TAG.test(lines[i])) continue;
    let block = lines[i];
    let j = i;
    while (!/\/?>/.test(lines[j]) && j < lines.length - 1) {
      j++;
      block += "\n" + lines[j];
    }
    blocks.push(block);
  }
  return blocks;
}

describe("storefront inputs are iOS zoom-safe (#56)", () => {
  const files = collectFiles();

  it("scans a non-empty set of customer-facing sources", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rel of files) {
    it(`${rel}: every text field ≥16px on mobile`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const offenders: string[] = [];

      for (const block of elementBlocks(src)) {
        if (NON_TEXT_TYPE.test(block)) continue;
        if (SMALL_TEXT.test(block) && !COMPANION.test(block)) {
          const firstLine = block.split("\n")[0].trim();
          offenders.push(firstLine);
        }
      }

      expect(
        offenders,
        `sub-16px text field(s) missing max-md:text-base in ${rel}:\n` +
          offenders.join("\n")
      ).toEqual([]);
    });
  }
});
