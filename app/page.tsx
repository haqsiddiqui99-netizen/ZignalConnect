import Link from "next/link";
import { cancelLogin, confirmLogin, login, resendLoginCode } from "@/lib/actions";
import { getSession, homePath } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CATALOG } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { LOGIN_CODE_ENABLED, pendingLogin } from "@/lib/login-code";
import { BrandMark } from "@/components/brand-mark";
import { SITE_LINKS } from "@/components/site-shell";
import { Banner } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { redirect } from "next/navigation";

const SITE_URL = "https://www.zignalconnect.com";

const SITE_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Zignal Connect",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Zignal Connect",
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string; notice?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homePath(session));
  getDb();
  const { error, step, notice } = await searchParams;
  const pending = LOGIN_CODE_ENABLED && step === "code" ? await pendingLogin() : null;

  return (
    <main className="login">
      <section className="login-brand">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_DATA) }} />
        <div>
          <div className="brand-lockup">
            <BrandMark />
            <div>
              <strong>ZIGNAL</strong>
              <span>Connect</span>
            </div>
          </div>
          <nav className="login-links" aria-label="Zignal Connect">
            {SITE_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
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
      </section>
      <section className="login-panel">
        <div className="panel-card">
          <h2>Sign in</h2>
          <Banner error={error} notice={notice === "sent" ? "A new code is on its way." : undefined} />
          {pending ? (
            <>
              <p className="fine" style={{ marginTop: 16 }}>
                Enter the 6-digit code sent to {pending.email}. It works for 10 minutes.
              </p>
              <form action={confirmLogin} className="stack" style={{ marginTop: 16 }}>
                <label className="field">
                  <span>
                    Sign-in code <i className="req" aria-hidden="true">*</i>
                  </span>
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    minLength={6}
                    maxLength={6}
                    pattern="[0-9]{6}"
                    title="6-digit code from your email"
                  />
                </label>
                <SubmitButton>Continue</SubmitButton>
              </form>
              <form action={resendLoginCode} style={{ marginTop: 10 }}>
                <SubmitButton className="btn">Send a new code</SubmitButton>
              </form>
              <form action={cancelLogin}>
                <p className="fine" style={{ marginTop: 14 }}>
                  <button className="linkish" type="submit">
                    Use a different account
                  </button>
                </p>
              </form>
            </>
          ) : (
            <form action={login} className="stack" style={{ marginTop: 16 }}>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="username" required />
              </label>
              <label className="field">
                <span>Password</span>
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              {LOGIN_CODE_ENABLED ? <p className="fine">After your password, a code is sent to this email.</p> : null}
              <SubmitButton>Sign in</SubmitButton>
            </form>
          )}
          <p className="fine" style={{ marginTop: 14 }}>
            <Link href="/forgot">Forgot password</Link>
            {" · "}
            New ISP? <Link href="/signup">Open a desk</Link>
            {" · "}
            <Link href="/privacy">Privacy</Link>
            {" · "}
            <Link href="/terms">Terms</Link>
            {" · "}
            <Link href="/refund">Refund</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
