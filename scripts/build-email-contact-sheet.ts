/**
 * Build the all-templates review sheet.
 *
 *   pnpm email:sheet              → docs/email-templates-preview.html
 *   pnpm email:sheet --hostile    → same, with the injection-probe fixture
 *   pnpm email:sheet <path.html>  → somewhere else
 *
 * The committed copy at docs/ is a generated artefact: it exists so the whole
 * set can be reviewed straight from a checkout with no install step. Re-run
 * this after changing any template or the shell.
 */

process.env.NEXT_PUBLIC_SITE_URL ||= "https://custom.mpillow.com";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderContactSheet } from "../lib/email/contact-sheet";

const args = process.argv.slice(2);
const fixture = args.includes("--hostile") ? "hostile" : "happy";
const target = resolve(
  process.cwd(),
  args.find((a) => !a.startsWith("--")) ?? "docs/email-templates-preview.html",
);

const html = renderContactSheet({ root: process.cwd(), fixture });
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html, "utf8");

const frames = (html.match(/<iframe/g) ?? []).length;
console.log(
  `${frames} templates (${fixture}) → ${target.replace(process.cwd() + "/", "")}  ${(
    html.length / 1024
  ).toFixed(0)} KB`,
);
