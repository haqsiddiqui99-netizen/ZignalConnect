import Link from "next/link";
import { login } from "@/lib/actions";
import { getSession, homePath } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DEMO_ADMIN, DEMO_CUSTOMER, DEMO_OPERATOR } from "@/lib/demo";
import { CATALOG } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homePath(session));
  getDb();
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
          <p className="eyebrow">Provider desk</p>
          <h1>Who is on the line, and when they renew.</h1>
          <p className="lede">
            Each ISP picks a plan from its subscriber base. Pro holds 500, Ultra holds 1,000, and Premium runs from
            3,000 to 30,000.
          </p>
          <div className="login-stats">
            <div>
              <b>{formatInr(CATALOG.pro.price)}</b>
              <span>Pro · 500 · {CATALOG.pro.trialDays}-day trial</span>
            </div>
            <div>
              <b>{formatInr(CATALOG.ultra.price)}</b>
              <span>Ultra · 1,000 · {CATALOG.ultra.trialDays}-day trial</span>
            </div>
            <div>
              <b>from {formatInr(CATALOG.premium_3000.price)}</b>
              <span>Premium · 3,000 to 30,000 · {CATALOG.premium_3000.trialDays}-day trial</span>
            </div>
          </div>
        </div>
        <p className="fine" style={{ color: "#d9c7a4" }}>
          Payments stay in this local ledger. Nothing is sent to a bank.
        </p>
      </section>
      <section className="login-panel">
        <div className="panel-card">
          <h2>Sign in</h2>
          <p className="fine">Provider staff, subscribers, and Zignal Connect use the same door. The account opens the right side.</p>
          <div style={{ height: 16 }} />
          <Banner error={error} />
          <form action={login} className="stack">
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="username" required placeholder="you@zignal.connect" />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <SubmitButton>Sign in</SubmitButton>
          </form>
          <p className="fine" style={{ marginTop: 14 }}>
            New ISP? <Link href="/signup">Open a desk</Link>
          </p>
          <div style={{ height: 22 }} />
          <p className="fine">Demo accounts on this computer</p>
          <div className="demo-row" style={{ marginTop: 8 }}>
            <form action={login}>
              <input type="hidden" name="email" value={DEMO_ADMIN.email} />
              <input type="hidden" name="password" value={DEMO_ADMIN.password} />
              <SubmitButton className="btn small" pendingLabel="Opening desk…">
                Enter as provider
              </SubmitButton>
            </form>
            <form action={login}>
              <input type="hidden" name="email" value={DEMO_CUSTOMER.email} />
              <input type="hidden" name="password" value={DEMO_CUSTOMER.password} />
              <SubmitButton className="btn small" pendingLabel="Opening portal…">
                Enter as subscriber
              </SubmitButton>
            </form>
            <form action={login}>
              <input type="hidden" name="email" value={DEMO_OPERATOR.email} />
              <input type="hidden" name="password" value={DEMO_OPERATOR.password} />
              <SubmitButton className="btn small" pendingLabel="Opening Zignal…">
                Enter as Zignal
              </SubmitButton>
            </form>
          </div>
          <p className="fine" style={{ marginTop: 12 }}>
            Provider: {DEMO_ADMIN.email} / {DEMO_ADMIN.password}
            <br />
            Subscriber: {DEMO_CUSTOMER.email} / {DEMO_CUSTOMER.password}
            <br />
            Zignal Connect: {DEMO_OPERATOR.email} / {DEMO_OPERATOR.password}
            <br />
            Other seeded subscribers use the password welcome123.
          </p>
        </div>
      </section>
    </main>
  );
}
