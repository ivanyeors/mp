"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckoutCodeContext, CheckoutCodeStatus } from "./shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const IDLE: CheckoutCodeStatus = { state: "idle" };
const CHECKING: CheckoutCodeStatus = { state: "checking" };
const CHECK_FAILED = "We couldn't check this code just now. It is checked again when you pay.";

export function useCheckoutCode(
  code: string,
  context: CheckoutCodeContext | null,
  email?: string,
): CheckoutCodeStatus {
  const typed = code.trim();
  const normalized = typed.toUpperCase();
  const contextKey = context ? JSON.stringify(context) : null;
  const emailKey = email && EMAIL_RE.test(email.trim()) ? email.trim() : "";
  const [answer, setAnswer] = useState<{ code: string; status: CheckoutCodeStatus } | null>(null);
  const answeredCode = useRef("");

  useEffect(() => {
    if (!normalized || !contextKey) return;
    const sameCode = answeredCode.current === normalized;
    const controller = new AbortController();
    const settle = (status: CheckoutCodeStatus) => {
      answeredCode.current = normalized;
      setAnswer({ code: normalized, status });
    };
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/checkout/code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: normalized,
              email: emailKey || undefined,
              context: JSON.parse(contextKey) as CheckoutCodeContext,
            }),
            signal: controller.signal,
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            settle({
              state: "error",
              message: res.status === 429 && typeof json.error === "string" ? json.error : CHECK_FAILED,
            });
          } else if (json.kind === "referral") {
            settle({
              state: "referral",
              code: normalized,
              partnerName: String(json.partner_name ?? ""),
              discount: Math.max(0, Number(json.discount_amount) || 0),
            });
          } else if (json.kind === "discount") {
            settle({
              state: "discount",
              code: String(json.code ?? normalized),
              discount: json.discount_amount == null ? null : Number(json.discount_amount) || 0,
              freeShipping: json.free_shipping === true,
            });
          } else if (json.kind === "invalid") {
            settle({ state: "invalid", code: normalized, reason: String(json.reason ?? "") });
          } else {
            settle({ state: "unknown", code: normalized });
          }
        } catch {
          if (!controller.signal.aborted) settle({ state: "error", message: CHECK_FAILED });
        }
      })();
    }, sameCode ? 250 : 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, contextKey, emailKey]);

  if (!normalized) return IDLE;
  if (!answer || answer.code !== normalized) return CHECKING;
  return answer.status;
}
