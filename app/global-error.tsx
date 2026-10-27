"use client";

import { figtree } from "./fonts";

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
          Please try again. If it keeps happening, contact us at custom.mpillow.com/support.
          {error.digest ? ` Reference: ${error.digest}` : null}
        </p>
        <button onClick={reset} style={{ padding: "0.5rem 1.5rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
