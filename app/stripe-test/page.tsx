"use client";

import { useState } from "react";

/**
 * Dev-only Stripe wiring probe UI. Kicks the bare test-checkout route and either
 * redirects to Stripe's hosted page or shows the raw Stripe error, so you can
 * confirm your key/permissions work independently of the real checkout form.
 */
export default function StripeTestPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("status")
      : null;

  async function startTest() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/test-checkout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ? JSON.stringify(data.error) : `Request failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Stripe wiring test</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Creates a bare SGD 1.00 Checkout Session (no coupon, customer, or automatic tax)
        and redirects to Stripe. Dev-only.
      </p>

      {status === "success" && (
        <p style={{ background: "#e6f7ec", color: "#1a7f37", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          Returned from Stripe: payment succeeded. The redirect + hosted page work.
        </p>
      )}
      {status === "cancelled" && (
        <p style={{ background: "#fff4e5", color: "#9a6700", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          Returned from Stripe: checkout cancelled. Wiring still works — you just backed out.
        </p>
      )}

      <button
        onClick={startTest}
        disabled={loading}
        style={{
          background: loading ? "#9ca3af" : "#635bff",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "12px 20px",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Creating session…" : "Test Stripe checkout ($1 SGD)"}
      </button>

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
