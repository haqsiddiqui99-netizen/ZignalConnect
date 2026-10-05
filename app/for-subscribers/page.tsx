import type { Metadata } from "next";
import { SiteCta, SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Subscriber portal",
  description:
    "Give your internet subscribers their own portal with your ISP name: connection details, renewal date, receipts, and complaints.",
  alternates: { canonical: "/for-subscribers" },
};

const PARTS = [
  {
    title: "My connection",
    text: "The subscriber sees their plan, speed, bill cycle, and the next renewal date.",
  },
  {
    title: "Renewal amount",
    text: "The amount due is shown clearly, with how to pay at your office or by calling your support number.",
  },
  {
    title: "Receipts",
    text: "Every payment you record appears as a receipt the subscriber can view, print, or download.",
  },
  {
    title: "Complaints",
    text: "Subscribers raise a connectivity complaint and follow its status, so fewer calls reach your office.",
  },
  {
    title: "AI chat with your name",
    text: "A chat button with your ISP name answers common questions and can report a line problem as a complaint.",
  },
  {
    title: "Your brand",
    text: "The portal carries your ISP name and logo. Subscribers sign in with the login sent in their onboarding message.",
  },
];

export default function ForSubscribersPage() {
  return (
    <SiteShell current="/for-subscribers">
      <section className="site-hero">
        <p className="site-eyebrow">Subscriber portal</p>
        <h1>Your subscribers get a portal with your name on it.</h1>
        <p className="site-lede">
          Every desk includes a subscriber portal. When you add a subscriber, they can sign in and see their own
          connection.
        </p>
      </section>
      <section className="site-grid">
        {PARTS.map((part) => (
          <article key={part.title} className="card site-card">
            <h2>{part.title}</h2>
            <p>{part.text}</p>
          </article>
        ))}
      </section>
      <SiteCta />
    </SiteShell>
  );
}
