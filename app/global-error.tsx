"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f3efe7", color: "#1c1916", fontFamily: "Georgia, Palatino, serif" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px" }}>
          <h1 style={{ fontWeight: 400, fontSize: 36 }}>Something went wrong on our side.</h1>
          <p style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: "#6f675e", lineHeight: 1.5 }}>
            We have been told about it. Try again, and if it keeps happening write to support@zignalconnect.com
            {error.digest ? ` and quote ${error.digest}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ background: "#14261e", color: "#f6f1e8", border: 0, borderRadius: 999, padding: "12px 22px", fontSize: 15, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
