"use client";

import { Toaster } from "sonner";

export function SonnerProvider() {
  return (
    <Toaster
      richColors
      position="top-right"
      // Keep toasts clear of the notch / Dynamic Island in the installed PWA.
      mobileOffset={{
        top: "calc(var(--safe-top) + 0.75rem)",
        left: "0.75rem",
        right: "0.75rem",
      }}
    />
  );
}

