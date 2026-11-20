// @vitest-environment jsdom
import { settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/sign-in-actions", () => ({ finishSignIn: vi.fn(), resubscribeMe: vi.fn() }));

const { LoginForm } = await import("../login-form");

/**
 * The email prefill can arrive after the form mounts (a Result loads its
 * customer email later): each new non-empty prefill fills the field, replacing
 * what was typed; an emptied or unchanged prefill leaves the field alone.
 */

let root: Root | null = null;
const render = (initialEmail: string) => act(() => root!.render(<LoginForm nextPath="/en-US/account" initialEmail={initialEmail} />));
const field = () => document.querySelector<HTMLInputElement>('input[type="email"]')!;

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});

describe("LoginForm email prefill", () => {
  it("fills from the prefill on mount and whenever a new one arrives", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    render("first@example.com");
    expect(field().value).toBe("first@example.com");

    typeField(field(), "typed@example.com");
    render("first@example.com");
    expect(field().value).toBe("typed@example.com");

    render("late@example.com");
    expect(field().value).toBe("late@example.com");

    render("");
    expect(field().value).toBe("late@example.com");

    typeField(field(), "mine@example.com");
    render("late@example.com");
    expect(field().value).toBe("late@example.com");
  });

  it("starts empty with no prefill and keeps what is typed", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    render("");
    expect(field().value).toBe("");
    typeField(field(), "typed@example.com");
    render("");
    expect(field().value).toBe("typed@example.com");
  });
});
