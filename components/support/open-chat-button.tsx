"use client";

import type { ReactNode } from "react";
import { openSupportChat } from "./support-chat-root";

export function OpenChatButton({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={openSupportChat} className="underline underline-offset-4">
      {children}
    </button>
  );
}
