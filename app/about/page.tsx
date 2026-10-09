import type { Metadata } from "next";
import Link from "next/link";
import { SiteCta, SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Zignal Connect is a provider desk and subscriber portal built for local internet service providers in India.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <SiteShell current="/about">
      <section className="site-hero">
        <p className="site-eyebrow">About Zignal Connect</p>
        <h1>Built for the local ISP office.</h1>
        <p className="site-lede">
          Local internet providers keep their subscribers in registers, spreadsheets, and phone notes. Zignal Connect
          puts the book, the renewals, the receipts, and the complaints in one place, and gives every subscriber a
          portal with the provider&apos;s own name.
        </p>
      </section>
      <section className="site-split">
        <article className="card site-card">
          <h2>Who it is for</h2>
          <p>
            Cable and broadband operators in India, from a few hundred subscribers to 30,000. Pro fits up to 500, Ultra
            up to 1,000, and Premium runs from 3,000 to 30,000. A larger book is a conversation with sales.
          </p>
        </article>
        <article className="card site-card">
          <h2>What the desk holds</h2>
          <p>
            Subscriber accounts, plans, renewals, invoices with GST, receipts, complaints, and a subscriber portal in
            the ISP&apos;s own name. Email reminders go out when the mail account is connected. Card and UPI collection
            is not on yet, so the office still records those payments.
          </p>
        </article>
        <article className="card site-card" id="sales">
          <h2>Sales</h2>
          <p>
            Write to <a href="mailto:sales@zignalconnect.com">sales@zignalconnect.com</a> for a plan, a book above
            30,000 subscribers, or a question before you open a desk. Every plan starts with a 30-day trial. No card is
            charged to try it.
          </p>
        </article>
        <article className="card site-card" id="contact">
          <h2>Contact</h2>
          <p>
            Email <a href="mailto:support@zignalconnect.com">support@zignalconnect.com</a> for help with a desk. For a
            plan or a new book, write to <a href="mailto:sales@zignalconnect.com">sales@zignalconnect.com</a>.
          </p>
          <p>
            Already have a desk? <Link href="/">Sign in</Link> and use Instant Support, or open Zignal Support from the
            desk to raise a ticket.
          </p>
        </article>
      </section>
      <SiteCta />
    </SiteShell>
  );
}
