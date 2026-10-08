import type { Metadata } from "next";
import Link from "next/link";
import { SiteCta, SiteShell } from "@/components/site-shell";
import {
  CATALOG,
  PLAN_POINTS,
  PREMIUM_PLANS,
  limitLabel,
  overflowLimit,
  termQuote,
  type PlanFamily,
} from "@/lib/entitlements";
import { formatInr } from "@/lib/format";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Pro from ${formatInr(CATALOG.pro.price)} a month for 500 subscribers, Ultra for 1,000, and Premium from 3,000 to 30,000. Every plan starts with a 30-day trial.`,
  alternates: { canonical: "/pricing" },
};

const HIDDEN_POINTS = new Set(["SMS and WhatsApp reminders", "Subscribers pay renewal online"]);

function pointsFor(family: PlanFamily) {
  return PLAN_POINTS.filter((point) => point.plans.includes(family) && !HIDDEN_POINTS.has(point.label)).map(
    (point) => point.label,
  );
}

const CARDS: { family: PlanFamily; name: string; price: number; customers: string; staff: string; note: string }[] = [
  {
    family: "pro",
    name: CATALOG.pro.label,
    price: CATALOG.pro.price,
    customers: limitLabel(CATALOG.pro.customers),
    staff: limitLabel(CATALOG.pro.staff),
    note: `Overflow to ${limitLabel(overflowLimit("pro"))} subscribers at ₹3 each.`,
  },
  {
    family: "ultra",
    name: CATALOG.ultra.label,
    price: CATALOG.ultra.price,
    customers: limitLabel(CATALOG.ultra.customers),
    staff: limitLabel(CATALOG.ultra.staff),
    note: `Overflow to ${limitLabel(overflowLimit("ultra"))} subscribers at ₹3 each.`,
  },
  {
    family: "premium",
    name: "Premium",
    price: CATALOG.premium_3000.price,
    customers: `${limitLabel(CATALOG.premium_3000.customers)}+`,
    staff: "20 / 10k",
    note: "The rate follows your subscriber base, up to 30,000.",
  },
];

export default function PricingPage() {
  const quarterly = termQuote(100, "quarterly").percent;
  const yearly = termQuote(100, "yearly").percent;
  return (
    <SiteShell current="/pricing">
      <section className="site-hero">
        <p className="site-eyebrow">Pricing</p>
        <h1>Pay for the size of your subscriber book.</h1>
        <p className="site-lede">
          Monthly is the list price. Quarterly saves {quarterly}%, and yearly saves {yearly}% (two months free). Every
          plan starts with a 30-day trial.
        </p>
      </section>
      <section className="plan-band">
        <div>
          <p className="site-eyebrow">For internet providers</p>
          <h2>Corporate Plans</h2>
        </div>
        <div className="site-plans">
        {CARDS.map((card) => (
          <article key={card.family} className="card site-card site-plan">
            <div className="plan-card-top">
              <h2>{card.name}</h2>
              <span className="trial-tab">30-day trial</span>
            </div>
            <div className="plan-price">
              <p className="hero-price">
                {card.family === "premium" ? <span className="fine">from </span> : null}
                {formatInr(card.price)}
              </p>
              <p className="fine">a month, billed monthly</p>
            </div>
            <ul className="plan-stats">
              <li>
                <b>{card.customers}</b>
                <span>subscribers</span>
              </li>
              <li>
                <b>{card.staff}</b>
                <span>staff</span>
              </li>
              <li>
                <b>30 days</b>
                <span>free trial</span>
              </li>
            </ul>
            <p className="fine">{card.note} Extra staff ₹10 a month.</p>
            <ul className="plan-points">
              {pointsFor(card.family).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <Link href="/signup" className="btn primary">
              Start {card.name} trial
            </Link>
          </article>
        ))}
        </div>
      </section>
      <section className="card site-card">
        <h2>Premium rates</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subscribers up to</th>
                <th>Monthly</th>
                <th>Quarterly</th>
                <th>Yearly</th>
                <th>Staff logins</th>
              </tr>
            </thead>
            <tbody>
              {PREMIUM_PLANS.map((plan) => {
                const tier = CATALOG[plan];
                return (
                  <tr key={plan}>
                    <td>{limitLabel(tier.customers)}</td>
                    <td>{formatInr(tier.price)}</td>
                    <td>{formatInr(termQuote(tier.price, "quarterly").due)}</td>
                    <td>{formatInr(termQuote(tier.price, "yearly").due)}</td>
                    <td>{tier.staff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fine" style={{ marginTop: 10 }}>
          A book above {limitLabel(CATALOG.premium_30000.customers)} subscribers is a custom offer.
        </p>
      </section>
      <SiteCta />
    </SiteShell>
  );
}
