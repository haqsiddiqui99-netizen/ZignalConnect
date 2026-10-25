import crypto from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmEmail } from "@/lib/actions";
import { one } from "@/lib/db";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Open your desk", robots: { index: false, follow: false } };

function confirmRow(token: string) {
  if (!token || token.length > 128) return undefined;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return one<{ expires_at: number }>("SELECT expires_at FROM email_confirms WHERE token_hash = ?", tokenHash);
}

/**
 * Opening the link only shows this page. The desk opens when the button is pressed, so a mail scanner
 * that follows links cannot use up the link or open the desk by itself.
 */
export default async function ConfirmTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = confirmRow(token);
  if (!row) notFound();
  const expired = row.expires_at < Date.now();

  return (
    <main className="auth-page">
      <div className="panel-card">
        <h2>Open your desk</h2>
        {expired ? (
          <p className="fine">
            This link has expired. <Link href="/confirm">Ask for a new one</Link>.
          </p>
        ) : (
          <>
            <p className="fine">Press the button to confirm this email and open your desk.</p>
            <div style={{ height: 16 }} />
            <form action={confirmEmail} className="stack">
              <input type="hidden" name="token" value={token} />
              <SubmitButton pendingLabel="Opening…">Confirm my email</SubmitButton>
            </form>
          </>
        )}
        <p className="fine" style={{ marginTop: 14 }}>
          <Link href="/">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
