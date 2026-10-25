import Link from "next/link";
import { resendConfirmation } from "@/lib/actions";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <main className="auth-page">
      <div className="panel-card">
        <h2>Confirm your email</h2>
        {sent === "1" ? (
          <p className="fine">
            If that email has a desk waiting, a link to open it is on its way. It works for 24 hours. Nothing after a few minutes? Check
            spam, or write to support@zignalconnect.com.
          </p>
        ) : (
          <>
            <p className="fine">
              A desk opens once its owner confirms the email. Enter the email you signed up with and we will send the link again.
            </p>
            <div style={{ height: 16 }} />
            <Banner error={error} />
            <form action={resendConfirmation} className="stack">
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="username" required />
              </label>
              <SubmitButton pendingLabel="Sending…">Send the link again</SubmitButton>
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
