import type { Metadata } from "next";
import { SiteCta, SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Instant Support and AI chat",
  description:
    "Instant Support lets ISP staff raise a ticket or ask about their plan from any page. Subscribers get an AI chat that shows your ISP name.",
  alternates: { canonical: "/instant-support" },
};

export default function InstantSupportPage() {
  return (
    <SiteShell current="/instant-support">
      <section className="site-hero">
        <p className="site-eyebrow">Included in Pro, Ultra, and Premium</p>
        <h1>Help is one button away, for you and your subscribers.</h1>
        <p className="site-lede">
          A support button sits in the corner of every page. Your staff reach Zignal, and your subscribers reach you.
        </p>
      </section>
      <section className="site-split">
        <article className="card site-card">
          <p className="site-eyebrow">For your staff</p>
          <h2>Instant Support</h2>
          <ul className="plan-points">
            <li>Raise a ticket to Zignal Support from any page of the desk.</li>
            <li>Ask what plan the desk is on, its subscriber limit, staff logins, and reminders.</li>
            <li>Follow each ticket as New, In-progress, Closed, Cancelled, or Duplicate, and reply in the same thread.</li>
          </ul>
        </article>
        <article className="card site-card">
          <p className="site-eyebrow">For your subscribers</p>
          <h2>AI chat with your ISP name</h2>
          <ul className="plan-points">
            <li>The chat greets subscribers with your ISP name, not ours.</li>
            <li>It answers common questions about their line.</li>
            <li>A subscriber can report a slow, unstable, or down line from the chat, and it opens a complaint on your desk.</li>
          </ul>
          <p className="fine">Full Zignal AI answers are coming soon.</p>
        </article>
      </section>
      <SiteCta />
    </SiteShell>
  );
}
