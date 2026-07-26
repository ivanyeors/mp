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

/**
 * Issue #56 — iOS zoom-safe sweep (storefront).
 *
 * iOS Safari auto-zooms when a focused text field renders below 16px. The shared
 * `Input`/`Textarea` primitives are already zoom-safe (text-base with md:text-sm),
 * so the risk is bypasses: a raw <input>/<textarea>, or an <Input> whose className
 * overrides the font size back down. This source scan fails if any customer-facing
 * text field carries a sub-16px text token (text-sm / text-xs / text-[10-15px])
 * WITHOUT a max-md:text-base companion to keep it ≥16px on mobile.
 *
 * Run: npx vitest run lib/shop/input-zoom-safe.test.ts
 */

// Resolve repo root from this file (lib/shop/ -> ../../).
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const SCAN_DIRS = ["components/shop", "app/[lang]/shop"];

// Sub-16px text tokens. text-[16px]+ and text-base/text-lg are fine.
const SMALL_TEXT = /\btext-(sm|xs|\[1[0-5]px\])\b/;
const COMPANION = /\bmax-md:text-base\b/;

// Elements iOS zooms on (text entry). Radios/checkboxes don't zoom, so we scan
// only these tags. <Input>/<Textarea> primitives are safe by default but a
// className override on them can reintroduce a small size, so include them.
const OPEN_TAG = /<(input|textarea|Input|Textarea)\b/;
// A text field that iOS zooms on. Exclude non-text raw inputs by their type.
const NON_TEXT_TYPE = /type=["'](radio|checkbox|range|color|file|button|submit|reset|hidden|image)["']/;

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const abs of walkTsx(join(ROOT, dir))) files.push(relative(ROOT, abs));
  }
  return files;
}

/** Extract each input/textarea element's full opening tag (may span lines). */
function elementBlocks(src: string): string[] {
  const lines = src.split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN_TAG.test(lines[i])) continue;
    // Accumulate until the tag closes (> or />), staying within the element.
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
        if (NON_TEXT_TYPE.test(block)) continue; // radios etc. don't zoom
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
