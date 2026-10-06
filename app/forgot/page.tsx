import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <main className="login-panel" style={{ minHeight: "100vh" }}>
      <div className="panel-card">
        <h2>Forgot password</h2>
        {sent === "1" ? (
          <p className="fine">Check your registered email and set a new password. The link works once, for 15 minutes.</p>
        ) : (
          <>
            <p className="fine">Enter the email you use to sign in. A link to set a new password is sent only to that inbox.</p>
            <div style={{ height: 16 }} />
            <Banner error={error} />
            <form action={requestPasswordReset} className="stack">
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="username" required placeholder="you@zignal.connect" />
              </label>
              <SubmitButton pendingLabel="Sending…">Send reset email</SubmitButton>
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
