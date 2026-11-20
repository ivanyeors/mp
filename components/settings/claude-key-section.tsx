"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/ui/info-tip";
import type { ClaudeCredentialSource } from "@/lib/ai/claude";

export function claudeKeyStatus(source: ClaudeCredentialSource | null): string {
  if (source === "saved") return "Claude is set up with the key saved here.";
  if (source === "environment") return "Claude is set up with the ANTHROPIC_API_KEY in Vercel. A key saved here takes its place.";
  if (source === "federation") return "Claude is set up with the Anthropic credentials in Vercel. A key saved here takes their place.";
  return "Claude isn't set up. Paste an API key to turn on review replies and AI writing.";
}

export function ClaudeKeyForm({
  source,
  value,
  onValueChange,
  busy,
  onSave,
  onRemove,
}: {
  source: ClaudeCredentialSource | null;
  value: string;
  onValueChange: (next: string) => void;
  busy: "save" | "remove" | null;
  onSave: () => void;
  onRemove: () => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid min-w-0 gap-4">
      <p role="status" className="flex items-start gap-2 text-sm">
        {source ? (
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        )}
        <span className="min-w-0">{claudeKeyStatus(source)}</span>
      </p>

      <form
        className="grid min-w-0 gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <Label htmlFor="claude-api-key">{source === "saved" ? "Replace the key" : "API key"}</Label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Input
              id="claude-api-key"
              type={shown ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={source === "saved" ? "Saved. Paste a new key to replace it" : "sk-ant-…"}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              aria-describedby="claude-api-key-hint"
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? "Hide the key" : "Show the key"}
              className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button type="submit" disabled={busy !== null || !value.trim()} className="shrink-0">
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy === "save" ? "Checking…" : "Save key"}
          </Button>
        </div>
        <p id="claude-api-key-hint" className="text-xs text-muted-foreground">
          Make one in the Anthropic Console, under API keys. It&apos;s checked with Anthropic before it&apos;s saved,
          and never shown again.
        </p>
      </form>

      {source === "saved" && (
        <div>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={onRemove}>
            {busy === "remove" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Remove the saved key
          </Button>
        </div>
      )}
    </div>
  );
}

export function ClaudeKeySection({
  source,
  onChange,
}: {
  source: ClaudeCredentialSource | null;
  onChange: (next: ClaudeCredentialSource | null) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);

  const send = async (method: "PUT" | "DELETE") => {
    setBusy(method === "PUT" ? "save" : "remove");
    try {
      const res = await fetch("/api/settings/claude-key", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ apiKey: value }) : undefined,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't save the key.");
      onChange((payload?.credentials ?? null) as ClaudeCredentialSource | null);
      if (method === "PUT") setValue("");
      toast.success(method === "PUT" ? "Claude API key saved" : "Claude API key removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the key.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="claude-key-heading" className="rounded-lg border p-4">
      <div className="mb-4 flex items-center gap-1.5">
        <h2 id="claude-key-heading" className="text-sm font-medium">
          Claude API key
        </h2>
        <InfoTip label="About the Claude API key">
          Claude drafts review replies and the campaign editor&apos;s ✨ writing. Its use is billed to the
          Anthropic account the key belongs to.
        </InfoTip>
      </div>
      <ClaudeKeyForm
        source={source}
        value={value}
        onValueChange={setValue}
        busy={busy}
        onSave={() => void send("PUT")}
        onRemove={() => {
          if (confirm("Remove the saved Claude API key?")) void send("DELETE");
        }}
      />
    </section>
  );
}
