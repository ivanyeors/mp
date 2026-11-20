"use client";

import { figtree } from "./fonts";

const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://custom.mpillow.com")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className={figtree.className} style={{ maxWidth: "36rem", margin: "15vh auto", padding: "0 1rem", lineHeight: 1.5 }}>
        <h1>Something went wrong</h1>
        <p>
          Please try again. If it keeps happening, contact us at {SITE_HOST}/support.
          {error.digest ? ` Reference: ${error.digest}` : null}
        </p>
        <button onClick={reset} style={{ padding: "0.5rem 1.5rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
