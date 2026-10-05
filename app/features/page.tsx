import type { Metadata } from "next";
import { SiteCta, SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Subscriber book, renewals, payments and receipts, complaints, collection reports, and staff logins in one desk for your ISP.",
  alternates: { canonical: "/features" },
};

const FEATURES = [
  {
    title: "Subscriber book",
    text: "Keep every subscriber with their plan, speed, bill cycle, and next renewal date. Import an existing list from a spreadsheet template.",
  },
  {
    title: "Plan catalogue",
    text: "Set up your internet plans and prices once, then assign them to subscribers in a click.",
  },
  {
    title: "Renewals and reminders",
    text: "See who renews this week and who is overdue. Payment reminders go out 3 days before the due date and on the due date.",
  },
  {
    title: "Payments and receipts",
    text: "Record payments taken at the office or by your collection staff. Each payment moves the renewal date ahead and issues a printable receipt.",
  },
  {
    title: "Complaints desk",
    text: "Subscribers raise connectivity complaints from their portal. Assign them to staff and track them as Open, In-progress, Closed, Cancelled, or Duplicate.",
  },
  {
    title: "Revenue and reports",
    text: "Watch collections by month and download the collection report for your accounts.",
  },
  {
    title: "Staff logins",
    text: "Give your team their own logins. Pro includes 3, Ultra 10, and Premium 20 for every 10,000 subscribers.",
  },
  {
    title: "Your brand",
    text: "Subscribers see your ISP name and logo on their portal and on the AI chat, not ours.",
  },
];

export default function FeaturesPage() {
  return (
    <SiteShell current="/features">
      <section className="site-hero">
        <p className="site-eyebrow">Provider desk</p>
        <h1>Everything an ISP office runs on, in one desk.</h1>
        <p className="site-lede">
          Zignal Connect replaces the register and the spreadsheet. Your staff see who is on the line, who is due, and
          who has paid.
        </p>
      </section>
      <section className="site-grid">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="card site-card">
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>
      <SiteCta />
    </SiteShell>
  );
}
