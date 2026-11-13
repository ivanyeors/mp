"use client";

import { figtree } from "./fonts";

/** The site's own address, fixed at build: www.mpillow.com after the move (ADR 0029). */
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://custom.mpillow.com")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

/**
 * Last-resort error page, for an error in the root layout itself. It replaces
 * the whole document, so it carries its own <html>, the site font and plain
 * inline styles.
 */
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
