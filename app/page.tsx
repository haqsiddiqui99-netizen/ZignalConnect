import Link from "next/link";
import { login } from "@/lib/actions";
import { getSession, homePath } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CATALOG } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(homePath(session));
  getDb();
  const { error } = await searchParams;

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
        </div>
      </section>
    </main>
  );
}
