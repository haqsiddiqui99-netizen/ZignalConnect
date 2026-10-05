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
            Cable and broadband operators with anything from a few hundred to 30,000 subscribers. Pro fits up to 500,
            Ultra up to 1,000, and Premium runs from 3,000 to 30,000.
          </p>
        </article>
        <article className="card site-card">
          <h2>Contact</h2>
          <p>
            Already have a desk? Sign in and use <b>Instant Support</b> or <b>Zignal Support</b> to raise a ticket.
            Thinking about it? <Link href="/signup">Open a desk</Link> and try it free for 30 days.
          </p>
        </article>
      </section>
      <SiteCta />
    </SiteShell>
  );
}
