import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export const SITE_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-subscribers", label: "Subscriber portal" },
  { href: "/instant-support", label: "Instant Support" },
  { href: "/about", label: "About" },
];

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund", label: "Refund" },
];

export function SiteShell({ current, children }: { current: string; children: React.ReactNode }) {
  return (
    <div className="site">
      <header className="site-top">
        <Link href="/" className="brand-lockup site-brand">
          <BrandMark />
          <div>
            <strong>ZIGNAL</strong>
            <span className="signup-mark">Connect</span>
          </div>
        </Link>
        <nav className="site-nav" aria-label="Zignal Connect">
          {SITE_LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="site-actions">
          <Link href="/" className="btn small">
            Sign in
          </Link>
          <Link href="/signup" className="btn small primary">
            Open a desk
          </Link>
        </div>
      </header>
      <main className="site-main">{children}</main>
      <footer className="site-foot">
        <nav aria-label="Footer">
          {SITE_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link href="/signup">Open a desk</Link>
          <Link href="/">Sign in</Link>
        </nav>
        <nav className="site-legal" aria-label="Policies">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={link.href === current ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="fine">
          Zignal Connect · Provider desk and subscriber portal for internet service providers. Sales{" "}
          <a href="mailto:sales@zignalconnect.com">sales@zignalconnect.com</a>
          {" · "}
          Support <a href="mailto:support@zignalconnect.com">support@zignalconnect.com</a>
        </p>
      </footer>
    </div>
  );
}

export function SiteCta() {
  return (
    <section className="site-cta">
      <div>
        <h2>Every plan starts with a 30-day trial.</h2>
        <p>Enter your subscriber base and the desk opens on the plan that fits.</p>
      </div>
      <Link href="/signup" className="btn light">
        Open a desk
      </Link>
    </section>
  );
}
