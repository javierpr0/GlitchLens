"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "10vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Application error</h1>
          <p style={{ marginTop: 12, opacity: 0.7, fontSize: 14 }}>{error.message}</p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 14px",
              borderRadius: 6,
              background: "#a855f7",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
