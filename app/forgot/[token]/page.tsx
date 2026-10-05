import crypto from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { completePasswordReset } from "@/lib/actions";
import { one } from "@/lib/db";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Set a new password" };

function resetRow(token: string) {
  if (!token || token.length > 128) return undefined;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return one<{ expires_at: string }>("SELECT expires_at FROM password_resets WHERE token_hash = ?", tokenHash);
}

export default async function SetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const row = resetRow(token);
  if (!row) notFound();
  const expired = Number(row.expires_at) < Date.now();

  return (
    <main className="login-panel" style={{ minHeight: "100vh" }}>
      <div className="panel-card">
        <h2>Set a new password</h2>
        {expired ? (
          <p className="fine">
            This link has expired. <Link href="/forgot">Start again</Link>.
          </p>
        ) : (
          <>
            <p className="fine">Choose a password of at least 6 characters. This link works once, for 15 minutes.</p>
            <div style={{ height: 16 }} />
            <Banner error={error} />
            <form action={completePasswordReset} className="stack">
              <input type="hidden" name="token" value={token} />
              <label className="field">
                <span>New password</span>
                <input name="new_password" type="password" autoComplete="new-password" required minLength={6} />
              </label>
              <label className="field">
                <span>Confirm</span>
                <input name="confirm_password" type="password" autoComplete="new-password" required minLength={6} />
              </label>
              <SubmitButton>Save password</SubmitButton>
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
