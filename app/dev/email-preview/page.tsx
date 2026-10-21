import { notFound } from "next/navigation";
import { isEmailPreviewAllowed } from "@/lib/email/preview-guard";
import {
  EMAIL_GROUP_LABELS,
  EMAIL_REGISTRY,
  getEmailCase,
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

export default async function EmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; fixture?: string }>;
}) {
  if (!isEmailPreviewAllowed()) notFound();

  const { id, fixture } = await searchParams;
  const selectedId = (id && getEmailCase(id)?.id) || EMAIL_REGISTRY[0].id;
  const selectedFixture = fixture === "hostile" ? "hostile" : "happy";
  const selected = getEmailCase(selectedId)!;
  const src = `/dev/email-preview/${selectedId}?fixture=${selectedFixture}`;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
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

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["happy", "hostile"] as const).map((f) => (
            <a
              key={f}
              href={`/dev/email-preview?id=${selectedId}&fixture=${f}`}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                textDecoration: "none",
                border: "1px solid #e5e5e5",
                background: selectedFixture === f ? "#171717" : "transparent",
                color: selectedFixture === f ? "#fafafa" : "#171717",
              }}
            >
              {f}
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
                  href={`/dev/email-preview?id=${entry.id}&fixture=${selectedFixture}`}
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
          <a href={`${src}&format=text`} style={{ fontSize: 12, marginLeft: "auto" }}>
            plain text
          </a>
          <a href={`${src}&format=json`} style={{ fontSize: 12 }}>
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
