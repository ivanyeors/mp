import { notFound } from "next/navigation";
import { isEmailPreviewAllowed } from "@/lib/email/preview-guard";
import {
  EMAIL_GROUP_LABELS,
  EMAIL_REGISTRY,
  getEmailCase,
  type EmailFixture,
  type EmailGroup,
} from "@/lib/email/registry";

// Dev-only surface for eyeballing every outbound email without sending one.
// Deliberately plain: it is a tool, not a product page, and it must not depend
// on app chrome that could restyle the iframe.
export const dynamic = "force-dynamic";

const GROUP_ORDER: EmailGroup[] = [
  "order",
  "account",
  "migration",
  "campaign",
  "aftercare",
  "results",
  "rma",
  "partner",
  "application",
  "auth",
  "support",
  "ops",
];

/** This page for a template, a fixture and Light or Dark. */
const pageHref = (id: string, fixture: EmailFixture, dark: boolean) =>
  `/dev/email-preview?id=${id}&fixture=${fixture}${dark ? "&dark=1" : ""}`;

const pillStyle = (on: boolean) => ({
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  textDecoration: "none",
  border: "1px solid #e5e5e5",
  background: on ? "#171717" : "transparent",
  color: on ? "#fafafa" : "#171717",
});

export default async function EmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; fixture?: string; dark?: string }>;
}) {
  if (!isEmailPreviewAllowed()) notFound();

  const { id, fixture, dark } = await searchParams;
  const selectedId = (id && getEmailCase(id)?.id) || EMAIL_REGISTRY[0].id;
  const selectedFixture = fixture === "hostile" ? "hostile" : "happy";
  // Dark: the shell's own dark rules forced on, as a reader in dark mode sees
  // the email (PRD-campaign-email-editor slice 15).
  const selectedDark = dark === "1";
  const selected = getEmailCase(selectedId)!;
  const asSent = `/dev/email-preview/${selectedId}?fixture=${selectedFixture}`;
  const src = selectedDark ? `${asSent}&dark=1` : asSent;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 280,
          flexShrink: 0,
          borderRight: "1px solid #e5e5e5",
          padding: 16,
          overflowY: "auto",
        }}
      >
        <h1 style={{ fontSize: 14, margin: "0 0 4px" }}>Email preview</h1>
        <p style={{ fontSize: 12, color: "#737373", margin: "0 0 16px" }}>
          {EMAIL_REGISTRY.length} templates
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {(["happy", "hostile"] as const).map((f) => (
            <a
              key={f}
              href={pageHref(selectedId, f, selectedDark)}
              aria-current={selectedFixture === f ? "true" : undefined}
              style={pillStyle(selectedFixture === f)}
            >
              {f}
            </a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {([false, true] as const).map((d) => (
            <a
              key={String(d)}
              href={pageHref(selectedId, selectedFixture, d)}
              aria-current={selectedDark === d ? "true" : undefined}
              style={pillStyle(selectedDark === d)}
            >
              {d ? "Dark" : "Light"}
            </a>
          ))}
        </div>

        {GROUP_ORDER.map((group) => {
          const entries = EMAIL_REGISTRY.filter((c) => c.group === group);
          if (entries.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: 16 }}>
              <p
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#737373",
                  margin: "0 0 6px",
                }}
              >
                {EMAIL_GROUP_LABELS[group]}
              </p>
              {entries.map((entry) => (
                <a
                  key={entry.id}
                  href={pageHref(entry.id, selectedFixture, selectedDark)}
                  style={{
                    display: "block",
                    fontSize: 13,
                    padding: "6px 8px",
                    borderRadius: 6,
                    textDecoration: "none",
                    color: entry.id === selectedId ? "#fafafa" : "#171717",
                    background: entry.id === selectedId ? "#171717" : "transparent",
                  }}
                >
                  {entry.label}
                </a>
              ))}
            </div>
          );
        })}
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e5e5",
            display: "flex",
            gap: 16,
            alignItems: "baseline",
          }}
        >
          <strong style={{ fontSize: 14 }}>{selected.label}</strong>
          <code style={{ fontSize: 12, color: "#737373" }}>{selected.id}</code>
          <span style={{ fontSize: 12, color: "#737373" }}>{selected.audience}</span>
          <a href={`${asSent}&format=text`} style={{ fontSize: 12, marginLeft: "auto" }}>
            plain text
          </a>
          <a href={`${asSent}&format=json`} style={{ fontSize: 12 }}>
            json
          </a>
        </header>
        <iframe
          key={src}
          src={src}
          title={selected.label}
          style={{ flex: 1, width: "100%", border: 0 }}
        />
      </main>
    </div>
  );
}
