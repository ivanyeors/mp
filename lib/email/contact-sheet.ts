// ============================================================
// All-templates review sheet
// ============================================================
//
// Renders every outbound email into ONE page so the whole set can be reviewed
// at a glance — the 24 templates our code sends, plus the 4 Supabase auth
// templates, which are generated into supabase/templates/ but sent by Supabase
// itself and are otherwise easy to forget.
//
// Shared by `scripts/build-email-contact-sheet.ts` (writes the committed copy at
// docs/email-templates-preview.html) and the /dev/email-preview/all route, so
// the file on disk and the live page can never disagree.
//
// Each email goes in its own <iframe srcdoc>. That is the only faithful option:
// every template is a complete document with its own <style> block and <body>
// background, which would otherwise collide with the host page and with the
// other 27. Rendering needs no JavaScript; script only auto-sizes the frames.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml } from "./html";
import { DARK, LIGHT } from "./theme";
import {
  EMAIL_GROUP_LABELS,
  EMAIL_REGISTRY,
  type EmailFixture,
  type EmailGroup,
} from "./registry";

const GROUP_ORDER: EmailGroup[] = [
  "order",
  "account",
  "migration",
  "aftercare",
  "results",
  "rma",
  "partner",
  "application",
  "auth",
  "support",
  "ops",
];

/** Dashboard template each generated auth file is pasted into. */
export const AUTH_TEMPLATE_LABELS: Record<string, string> = {
  "magic-link.html": "Magic Link",
  "confirm-signup.html": "Confirm signup",
  "invite-user.html": "Invite user",
  "reset-password.html": "Reset password",
  "change-email.html": "Change Email Address",
  "reauthentication.html": "Reauthentication",
};

interface Panel {
  id: string;
  label: string;
  meta: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * The Supabase auth templates, read off disk. They are not in EMAIL_REGISTRY
 * because our code never renders them — Supabase does, substituting the Go
 * placeholders they carry.
 */
function authPanels(root: string): Panel[] {
  const dir = join(root, "supabase", "templates");
  let files: string[];
  try {
    // Only the generated auth templates. The folder can hold other HTML
    // (e.g. a preview sheet), which must not be embedded as a template.
    files = readdirSync(dir).filter((f) => f in AUTH_TEMPLATE_LABELS);
  } catch {
    return []; // Not generated yet — the sheet still renders the other 24.
  }
  return files
    .sort()
    .map((file) => ({
      id: `supabase/${file}`,
      label: AUTH_TEMPLATE_LABELS[file] ?? file,
      meta: "sent by Supabase · paste into the dashboard",
      subject: "Subject is set in the Supabase dashboard, not in the file",
      html: readFileSync(join(dir, file), "utf8"),
    }));
}

function panelHtml(panel: Panel, index: number): string {
  return `<article class="panel" id="${escapeHtml(panel.id)}">
  <header class="panel-head">
    <div>
      <h3>${escapeHtml(panel.label)}</h3>
      <p class="subject">${escapeHtml(panel.subject)}</p>
    </div>
    <div class="panel-meta">
      <code>${escapeHtml(panel.id)}</code>
      <span>${escapeHtml(panel.meta)}</span>
    </div>
  </header>
  <iframe
    data-frame="${index}"
    title="${escapeHtml(panel.label)}"
    loading="lazy"
    srcdoc="${escapeHtml(panel.html)}"
  ></iframe>
  ${
    panel.text
      ? `<details>
    <summary>Plain-text alternative</summary>
    <pre>${escapeHtml(panel.text)}</pre>
  </details>`
      : ""
  }
</article>`;
}

/**
 * Build the review sheet.
 *
 * `root` is the repo root, used to locate supabase/templates. `fixture` picks
 * the sample data — "hostile" fills every free-text field with an injection
 * probe, which is a quick way to eyeball that escaping holds.
 */
export function renderContactSheet(opts: {
  root: string;
  fixture?: EmailFixture;
}): string {
  const fixture = opts.fixture ?? "happy";

  const groups = GROUP_ORDER.map((group) => {
    const panels: Panel[] = EMAIL_REGISTRY.filter((c) => c.group === group).map(
      (entry) => {
        const rendered = entry.render(fixture);
        return {
          id: entry.id,
          label: entry.label,
          meta: entry.audience,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        };
      },
    );
    return { label: EMAIL_GROUP_LABELS[group], panels };
  }).filter((g) => g.panels.length > 0);

  const auth = authPanels(opts.root);
  if (auth.length > 0) {
    groups.push({ label: "Supabase auth (hosted)", panels: auth });
  }

  const total = groups.reduce((n, g) => n + g.panels.length, 0);

  const slug = (label: string) => label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  let i = 0;
  const sections = groups
    .map(
      (g) => `<section id="${escapeHtml(slug(g.label))}">
  <h2>${escapeHtml(g.label)} <span class="count">${g.panels.length}</span></h2>
  <div class="grid">
${g.panels.map((p) => panelHtml(p, i++)).join("\n")}
  </div>
</section>`,
    )
    .join("\n");

  const nav = groups
    .map((g) => `<a href="#${escapeHtml(slug(g.label))}">${escapeHtml(g.label)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Mpillow email templates — ${total} documents</title>
<style>
  /* The sheet's own chrome uses the same neutrals as the emails it frames. */
  :root {
    color-scheme: light dark;
    --bg: ${LIGHT.page}; --fg: ${LIGHT.fg}; --muted: ${LIGHT.mutedFg};
    --border: ${LIGHT.border}; --card: ${LIGHT.card};
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: ${DARK.page}; --fg: ${DARK.fg}; --muted: ${DARK.mutedFg};
      --border: ${DARK.border}; --card: ${DARK.card};
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); }
  header.top {
    position: sticky; top: 0; z-index: 10; background: var(--bg);
    border-bottom: 1px solid var(--border); padding: 16px 24px;
  }
  header.top h1 { margin: 0 0 4px; font-size: 16px; }
  header.top p { margin: 0; font-size: 13px; color: var(--muted); }
  nav { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  nav a {
    font-size: 12px; padding: 4px 10px; border: 1px solid var(--border);
    border-radius: 999px; text-decoration: none; color: var(--fg);
  }
  .controls { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .controls button {
    font: inherit; font-size: 12px; padding: 5px 12px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer;
  }
  .controls button[aria-pressed="true"] { background: var(--fg); color: var(--bg); }
  main { padding: 24px; }
  section { margin-bottom: 40px; }
  section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .count { color: var(--muted); font-weight: 400; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(620px, 1fr)); gap: 24px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
  .panel { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--card); }
  .panel-head { display: flex; justify-content: space-between; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .panel-head h3 { margin: 0; font-size: 14px; }
  .subject { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .panel-meta { text-align: right; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .panel-meta code { display: block; }
  iframe { width: 100%; height: 640px; border: 0; display: block; background: ${LIGHT.card}; }
  details { border-top: 1px solid var(--border); }
  summary { cursor: pointer; padding: 10px 16px; font-size: 12px; color: var(--muted); }
  pre { margin: 0; padding: 0 16px 16px; font-size: 12px; white-space: pre-wrap; color: var(--fg); }
</style>
</head>
<body>
<header class="top">
  <h1>Mpillow email templates</h1>
  <p>${total} documents · fixture: ${escapeHtml(fixture)} · generated ${new Date()
    .toISOString()
    .slice(0, 10)}</p>
  <div class="controls">
    <button id="ogsc" type="button" aria-pressed="false">Simulate Outlook.com dark</button>
    <button id="expand" type="button" aria-pressed="false">Expand all plain text</button>
  </div>
  <nav>${nav}</nav>
</header>
<main>
${sections}
</main>
<script>
  // Auto-size each frame to its content. srcdoc frames are same-origin, so the
  // document is reachable. Rendering does not depend on this running.
  function fit(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      frame.style.height = Math.max(240, doc.documentElement.scrollHeight) + "px";
    } catch (e) { /* leave the fallback height */ }
  }
  const frames = Array.from(document.querySelectorAll("iframe"));
  frames.forEach((f) => {
    f.addEventListener("load", () => fit(f));
    fit(f);
  });
  window.addEventListener("resize", () => frames.forEach(fit));

  // Outlook.com rewrites inline styles and ignores the dark-mode media query,
  // falling back to [data-ogsc] selectors. Stamping the attribute here is the
  // only practical way to eyeball that path.
  const ogsc = document.getElementById("ogsc");
  ogsc.addEventListener("click", () => {
    const on = ogsc.getAttribute("aria-pressed") !== "true";
    ogsc.setAttribute("aria-pressed", String(on));
    frames.forEach((f) => {
      const root = f.contentDocument && f.contentDocument.documentElement;
      if (!root) return;
      if (on) root.setAttribute("data-ogsc", "");
      else root.removeAttribute("data-ogsc");
      fit(f);
    });
  });

  const expand = document.getElementById("expand");
  expand.addEventListener("click", () => {
    const on = expand.getAttribute("aria-pressed") !== "true";
    expand.setAttribute("aria-pressed", String(on));
    document.querySelectorAll("details").forEach((d) => { d.open = on; });
  });
</script>
</body>
</html>
`;
}
