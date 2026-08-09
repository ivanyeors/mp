/**
 * Write every registered email to disk so they can be opened in a real client.
 *
 *   npx tsx scripts/dump-email-previews.ts [outDir] [--fixture=hostile]
 *
 * Defaults to `.scratch/email/`. Useful for forwarding a rendered template into
 * Gmail / Outlook / Apple Mail, which is the only true fidelity check — the dev
 * preview route renders in a browser, not a mail client.
 */

process.env.NEXT_PUBLIC_SITE_URL ||= "https://custom.mpillow.com";

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EMAIL_REGISTRY, type EmailFixture } from "../lib/email/registry";

const args = process.argv.slice(2);
const fixtureArg = args.find((a) => a.startsWith("--fixture="));
const fixture: EmailFixture = fixtureArg?.split("=")[1] === "hostile" ? "hostile" : "happy";
// `resolve` so an absolute outDir is honoured rather than appended to cwd.
const outDir = resolve(process.cwd(), args.find((a) => !a.startsWith("--")) ?? ".scratch/email");

mkdirSync(outDir, { recursive: true });

for (const entry of EMAIL_REGISTRY) {
  const rendered = entry.render(fixture);
  const base = entry.id.replace(/\./g, "_");
  writeFileSync(join(outDir, `${base}.html`), rendered.html, "utf8");
  writeFileSync(join(outDir, `${base}.txt`), rendered.text, "utf8");
  console.log(`${entry.id.padEnd(32)} ${rendered.subject}`);
}

console.log(`\n${EMAIL_REGISTRY.length} templates (${fixture}) → ${outDir}`);
