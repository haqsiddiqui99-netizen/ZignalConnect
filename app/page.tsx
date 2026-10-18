import Link from "next/link";
import { cancelLogin, confirmLogin, login, resendLoginCode } from "@/lib/actions";
import { getSession, homePath } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CATALOG } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { pendingLogin } from "@/lib/login-code";
import { BrandMark } from "@/components/brand-mark";
import { DemoVideo } from "@/components/demo-video";
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
  const pending = step === "code" ? await pendingLogin() : null;

  return (
    <main className="login">
      <section className="login-brand">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_DATA) }} />
        <div className="login-top">
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
            <DemoVideo variant="nav" />
          </nav>
        </div>
        <div>
          <p className="eyebrow">Provider desk</p>
          <h1>Who is on the line, and when they renew.</h1>
          <p className="lede">
            Each ISP picks a plan from its subscriber base. Pro holds 500, Ultra holds 1,000, and Premium runs from
            3,000 to 30,000.
          </p>
          <div className="login-demo">
            <DemoVideo variant="hero" />
          </div>
          <div className="login-stats">
            <div>
              <b>{formatInr(CATALOG.pro.price)}</b>
              <span>Pro · 500 · {CATALOG.pro.trialDays}-day trial · + GST applicable</span>
            </div>
            <div>
              <b>{formatInr(CATALOG.ultra.price)}</b>
              <span>Ultra · 1,000 · {CATALOG.ultra.trialDays}-day trial · + GST applicable</span>
            </div>
            <div>
              <b>from {formatInr(CATALOG.premium_3000.price)}</b>
              <span>Premium · 3,000 to 30,000 · {CATALOG.premium_3000.trialDays}-day trial · + GST applicable</span>
            </div>
          </div>
          <ul className="login-trust">
            <li>
              <b>30-day trial</b>
              <span>The desk opens with your subscriber list. No card is charged during the trial.</span>
            </li>
            <li>
              <b>Your subscribers pay you</b>
              <span>Cash and your own UPI. Their money does not come to Zignal.</span>
            </li>
            <li>
              <b>Set up with you</b>
              <span>The first desks are opened in person. Your list is imported, and the overdue lines are on the screen the same day.</span>
            </li>
          </ul>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-open">
          <p>
            New ISP? <Link href="/signup">Open a desk here</Link>
          </p>
        </div>
        <div className="panel-card">
          <h2>Sign in</h2>
          <Banner error={error} notice={notice === "sent" ? "A new code is on its way." : undefined} />
          {pending ? (
            <>
              <p className="fine" style={{ marginTop: 16 }}>
                Enter the 6-digit code sent {pending.channel === "whatsapp" ? "on WhatsApp to" : "to"} {pending.where}. It works for 10 minutes.
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
                    title="6-digit sign-in code"
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
                <span className="password-line">
                  Password
                  <Link href="/forgot">Forgot password</Link>
                </span>
                <input name="password" type="password" autoComplete="current-password" aria-label="Password" required />
              </label>
              <p className="fine">A desk sign-in then asks for a code sent to the email or WhatsApp chosen for that desk.</p>
              <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
            </form>
          )}
          <p className="fine login-legal" style={{ marginTop: 14 }}>
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
