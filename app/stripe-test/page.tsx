"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Config = {
  secretMode: "test" | "live" | "missing" | "unknown";
  publishableMode: "test" | "live" | "missing" | "unknown";
  webhookSecretSet: boolean;
  siteUrl: string | null;
  readyForTestCards: boolean;
};

type SessionProbe = {
  session: { id: string; status: string | null; payment_status: string; mode: string };
  paymentIntent: {
    id: string;
    status: string;
    capture_method: string;
    amount: number;
    currency: string;
    amount_capturable: number;
  } | null;
  isHold: boolean;
};

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", note: "Succeeds (use for holds + payments)" },
  { number: "4000 0000 0000 0002", note: "Card declined" },
  { number: "4000 0000 0000 9995", note: "Insufficient funds" },
  { number: "4000 0025 0000 3155", note: "Requires 3D Secure (auth in modal)" },
];

/**
 * Dev-only Stripe E2E probe UI. Confirms test-mode keys, runs payment or
 * authorization-hold Checkout, and inspects the resulting PaymentIntent.
 */
export default function StripeTestPage() {
  const [loading, setLoading] = useState<"payment" | "hold" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [probe, setProbe] = useState<SessionProbe | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const status = params?.get("status");
  const kind = params?.get("kind");
  const sessionId = params?.get("session_id");

  useEffect(() => {
    fetch("/api/stripe/test-checkout")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setConfig(data as Config);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setProbeError(null);
    fetch(`/api/stripe/test-checkout?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        setProbe(data as SessionProbe);
      })
      .catch((err) => setProbeError(err instanceof Error ? err.message : "Probe failed"));
  }, [sessionId]);

  async function startTest(nextKind: "payment" | "hold") {
    setError(null);
    setLoading(nextKind);
    try {
      const res = await fetch("/api/stripe/test-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: nextKind }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error ?? `Request failed (${res.status})`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Stripe local E2E</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        Dev-only probe for hosted Checkout. Use test keys + the cards below. For real shop/hold
        flows (orders, results, ledger), also run webhook forwarding — see checklist.
      </p>

      {config && (
        <div
          style={{
            background: config.readyForTestCards ? "#e6f7ec" : "#fdecec",
            color: config.readyForTestCards ? "#1a7f37" : "#b42318",
            padding: "12px 14px",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Keys:</strong> secret={config.secretMode}, publishable={config.publishableMode}
          {" · "}
          webhook secret {config.webhookSecretSet ? "set" : "missing"}
          {" · "}
          site={config.siteUrl ?? "(unset)"}
          {!config.readyForTestCards && (
            <div style={{ marginTop: 8 }}>
              Test cards only work with <code>sk_test_…</code> / <code>rk_test_…</code>. Your
              secret key is <strong>{config.secretMode}</strong>. In the Stripe Dashboard, toggle
              <strong> Test mode</strong> (top-right), copy the test secret, put it in{" "}
              <code>.env.local</code> as <code>STRIPE_SECRET_KEY</code>, restart{" "}
              <code>npm run dev</code>.
            </div>
          )}
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Local checklist</h2>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#333", lineHeight: 1.7 }}>
          <li>
            Dashboard in <strong>Test mode</strong>; <code>STRIPE_SECRET_KEY</code> starts with{" "}
            <code>sk_test_</code> or <code>rk_test_</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_SITE_URL=http://localhost:3000</code>
          </li>
          <li>
            Terminal A: <code>npm run dev</code>
          </li>
          <li>
            Terminal B: <code>npm run stripe:listen</code> — paste the printed{" "}
            <code>whsec_…</code> into <code>STRIPE_WEBHOOK_SECRET</code>, restart dev
          </li>
          <li>
            Probe here, or run the real paths: <code>/mp-config</code> (hold) / shop checkout
            (order)
          </li>
        </ol>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Test cards</h2>
        <p style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          Expiry any future date · CVC any 3 digits · name/postal anything
        </p>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <tbody>
            {TEST_CARDS.map((c) => (
              <tr key={c.number} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "8px 0", fontFamily: "ui-monospace, monospace" }}>{c.number}</td>
                <td style={{ padding: "8px 0", color: "#555" }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {status === "success" && (
        <div
          style={{
            background: "#e6f7ec",
            color: "#1a7f37",
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          Returned from Stripe ({kind ?? "payment"}). Redirect + hosted page work.
        </div>
      )}
      {status === "cancelled" && (
        <div
          style={{
            background: "#fff4e5",
            color: "#9a6700",
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          Checkout cancelled — wiring still works.
        </div>
      )}

      {probe && (
        <pre
          style={{
            background: probe.isHold ? "#eef2ff" : "#f4f4f5",
            color: "#18181b",
            padding: "12px 14px",
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 16,
            overflow: "auto",
          }}
        >
          {probe.isHold
            ? "✓ Authorization hold: PaymentIntent requires_capture (not charged yet)\n\n"
            : probe.paymentIntent?.capture_method === "automatic"
              ? "✓ Payment captured (auto-capture)\n\n"
              : ""}
          {JSON.stringify(
            { session: probe.session, paymentIntent: probe.paymentIntent, isHold: probe.isHold },
            null,
            2,
          )}
        </pre>
      )}
      {probeError && (
        <pre
          style={{
            background: "#fdecec",
            color: "#b42318",
            padding: "12px 14px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Session probe failed: {probeError}
        </pre>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => startTest("hold")}
          disabled={loading !== null}
          style={btnStyle(loading === "hold", "#635bff")}
        >
          {loading === "hold" ? "Creating…" : "Test authorization hold ($1 SGD)"}
        </button>
        <button
          type="button"
          onClick={() => startTest("payment")}
          disabled={loading !== null}
          style={btnStyle(loading === "payment", "#18181b")}
        >
          {loading === "payment" ? "Creating…" : "Test full payment ($1 SGD)"}
        </button>
      </div>

      {error && (
        <pre
          style={{
            marginTop: 20,
            background: "#fdecec",
            color: "#b42318",
            padding: "12px 14px",
            borderRadius: 8,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error}
        </pre>
      )}
    </div>
  );
}

function btnStyle(loading: boolean, bg: string): CSSProperties {
  return {
    background: loading ? "#9ca3af" : bg,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? "default" : "pointer",
  };
}
