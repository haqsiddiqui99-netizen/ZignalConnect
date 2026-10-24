"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-main">
      <h1 className="serif">Something went wrong on our side.</h1>
      <p className="fine">
        We have been told about it. Try again, and if it keeps happening write to support@zignalconnect.com
        {error.digest ? ` and quote ${error.digest}` : ""}.
      </p>
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" onClick={() => reset()}>
          Try again
        </button>
        <Link className="btn" href="/">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
