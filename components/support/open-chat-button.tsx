"use client";

import type { ReactNode } from "react";
import { openSupportChat } from "./support-chat-root";

/** An inline link-styled button that opens the website chat window. */
export function OpenChatButton({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={openSupportChat} className="underline underline-offset-4">
      {children}
    </button>
  );
}
