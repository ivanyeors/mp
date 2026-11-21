import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeKeyForm, claudeKeyStatus } from "../claude-key-section";
import { claudeKeyRefusal } from "@/lib/ai/claude-key";
import type { ClaudeCredentialSource } from "@/lib/ai/claude";

const render = (source: ClaudeCredentialSource | null, value = "") =>
  renderToStaticMarkup(
    <ClaudeKeyForm source={source} value={value} onValueChange={() => {}} busy={null} onSave={() => {}} onRemove={() => {}} />,
  );

describe("ClaudeKeyForm", () => {
  it("asks for a key when none is set, in a hidden field with a label", () => {
    const html = render(null);
    expect(html).toContain("Claude isn&#x27;t set up. Paste an API key to turn on review replies and AI writing.");
    expect(html).toContain('type="password"');
    expect(html).toContain('for="claude-api-key"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('aria-label="Show the key"');
    expect(html).not.toContain("Remove the saved key");
  });

  it("holds Save until something is pasted", () => {
    expect(render(null)).toContain('type="submit" disabled=""');
    expect(render(null, "sk-ant-api03-x")).not.toContain('type="submit" disabled=""');
  });

  it("says a key is saved without showing it, and offers to replace or remove it", () => {
    const html = render("saved");
    expect(html).toContain("Claude is set up with the key saved here.");
    expect(html).toContain("Replace the key");
    expect(html).toContain("Saved. Paste a new key to replace it");
    expect(html).toContain("Remove the saved key");
  });

  it("names Vercel's credentials, and that a saved key takes their place", () => {
    expect(render("environment")).toContain("ANTHROPIC_API_KEY in Vercel. A key saved here takes its place.");
    expect(render("federation")).toContain("Anthropic credentials in Vercel. A key saved here takes their place.");
    expect(render("environment")).not.toContain("Remove the saved key");
  });

  it("has a status line for every source", () => {
    for (const s of ["saved", "environment", "federation", null] as const) expect(claudeKeyStatus(s)).toMatch(/\.$/);
  });
});

describe("claudeKeyRefusal", () => {
  it("tells a rejected key from an admin key and from Anthropic being unreachable", () => {
    const headers = new Headers();
    expect(claudeKeyRefusal(new Anthropic.AuthenticationError(401, undefined, "bad", headers))).toContain("didn't accept this key");
    expect(claudeKeyRefusal(new Anthropic.PermissionDeniedError(403, undefined, "no", headers))).toContain("not an admin key");
    expect(claudeKeyRefusal(new Anthropic.InternalServerError(500, undefined, "down", headers))).toBe(
      "Anthropic couldn't check the key (error 500). Try again in a minute.",
    );
    expect(claudeKeyRefusal(new Error("fetch failed"))).toBe("Couldn't reach Anthropic to check the key. Try again in a minute.");
  });
});
