import Link from "next/link";
import { redirect } from "next/navigation";
import { registerProvider } from "@/lib/actions";
import { getSession, homePath } from "@/lib/auth";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Open a desk" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homePath(session));
  const { error } = await searchParams;

  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand-lockup">
          <div className="brand-mark">Z</div>
          <div>
            <strong>ZIGNAL</strong>
            <span>Connect</span>
          </div>
        </div>
        <div>
          <p className="eyebrow">Free desk</p>
          <h1>Start with 10 customers.</h1>
          <p className="lede">
            Add your plans, then import the book you already have. Pro holds 500 customers, Ultra holds 1,000, and Premium has no cap.
          </p>
        </div>
        <p className="fine" style={{ color: "#d9c7a4" }}>
          Switching plans updates this desk. A card charge for the subscription is not connected yet.
        </p>
      </section>
      <section className="login-panel">
        <div className="panel-card">
          <h2>Open your desk</h2>
          <p className="fine">You will be the owner. Extra staff logins come with Pro, Ultra, and Premium.</p>
          <div style={{ height: 16 }} />
          <Banner error={error} />
          <form action={registerProvider} className="stack">
            <label className="field">
              <span>ISP name</span>
              <input name="isp_name" required placeholder="Harbour Fibre" />
            </label>
            <label className="field">
              <span>Your name</span>
              <input name="name" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete="new-password" required minLength={6} />
            </label>
            <label className="field">
              <span>Support mobile</span>
              <input name="support_phone" inputMode="numeric" placeholder="98xxxxxxxx" />
            </label>
            <SubmitButton>Create free desk</SubmitButton>
          </form>
          <p className="fine" style={{ marginTop: 14 }}>
            Already have a desk? <Link href="/">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
