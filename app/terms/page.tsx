import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for an ISP desk and subscriber portal on Zignal Connect.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <SiteShell current="/terms">
      <section className="site-hero">
        <p className="site-eyebrow">Terms</p>
        <h1>The rules for using a desk.</h1>
        <p className="site-lede">These terms apply when an ISP opens a desk or a subscriber signs in to a portal. They were last updated on 6 October 2026.</p>
      </section>
      <article className="card site-card legal">
        <h2>The service</h2>
        <p>
          Zignal Connect is software for an ISP office: the subscriber book, plans, renewals, receipts, complaints, and
          a portal that shows the ISP&apos;s name. It is not a bank and it does not provide the internet line.
        </p>
        <h2>Who may open a desk</h2>
        <p>
          The person who opens a desk must be allowed to keep that ISP&apos;s subscriber records. Staff logins are
          created by the desk owner. A subscriber signs in only to their own line.
        </p>
        <h2>Plans</h2>
        <p>
          Pro holds up to 500 subscribers, Ultra up to 1,000, and Premium from 3,000 to 30,000. Every plan starts with
          a 30-day trial. Monthly is the list price. Quarterly is 10% off, and yearly drops two months. The prices on
          the <Link href="/pricing">Pricing</Link> page are the prices that apply.
        </p>
        <h2>Payments</h2>
        <p>
          A payment recorded at the office stays in the desk ledger and moves the renewal date. Zignal Connect does not
          take that money. Online card or UPI collection for a subscriber bill, and online payment of a desk plan, are
          not connected yet. Until they are, nothing is charged to a card or UPI account.
        </p>
        <h2>The subscriber book</h2>
        <p>
          The ISP is responsible for the names, mobiles, addresses, and payment notes it enters, and for the money it
          collects from subscribers. What we store, and who can see it, is on the <Link href="/privacy">Privacy</Link>{" "}
          page.
        </p>
        <h2>Fair use</h2>
        <p>Do not use a desk to break the law, to send mail the recipient did not ask for, or to open a line for someone else&apos;s subscribers.</p>
        <h2>Stopping a desk</h2>
        <p>
          An owner can ask for the desk to be closed by writing to{" "}
          <a href="mailto:support@zignalconnect.com">support@zignalconnect.com</a>. A fee already paid for a term that
          has started is covered on the <Link href="/refund">Refund</Link> page.
        </p>
      </article>
    </SiteShell>
  );
}
