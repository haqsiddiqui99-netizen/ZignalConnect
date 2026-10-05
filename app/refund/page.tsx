import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Refund",
  description: "When a Zignal Connect desk fee is returned, and which payments stay with the ISP.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <SiteShell current="/refund">
      <section className="site-hero">
        <p className="site-eyebrow">Refund</p>
        <h1>When a desk fee comes back.</h1>
        <p className="site-lede">This covers fees an ISP pays Zignal Connect for a desk. It was last updated on 6 October 2026.</p>
      </section>
      <article className="card site-card legal">
        <h2>The trial</h2>
        <p>The first 30 days of Pro, Ultra, or Premium are free. No desk fee is taken during the trial, so there is nothing to return.</p>
        <h2>Before a paid term starts</h2>
        <p>
          If a desk fee is paid and the paid month, quarter, or year has not started, that fee is returned in full.
          Write to <a href="mailto:support@zignalconnect.com">support@zignalconnect.com</a> with the desk email and the
          payment date.
        </p>
        <h2>After a paid term starts</h2>
        <p>
          A month, quarter, or year that has already started is not refunded. A later term that has been paid and has
          not started can still be cancelled, and that later fee is returned.
        </p>
        <h2>Subscriber payments</h2>
        <p>
          Money a subscriber pays the ISP at the office is recorded on the desk. Zignal Connect does not hold it, and
          does not refund it. That is between the ISP and the subscriber. Online card and UPI collection is not
          connected yet.
        </p>
        <h2>How to ask</h2>
        <p>
          Email <a href="mailto:support@zignalconnect.com">support@zignalconnect.com</a> from the desk owner&apos;s
          address. Say the ISP name, the amount, and the date. A fee that qualifies is returned to the same method
          that paid it. The <Link href="/terms">Terms</Link> explain what the desk fee is for.
        </p>
      </article>
    </SiteShell>
  );
}
