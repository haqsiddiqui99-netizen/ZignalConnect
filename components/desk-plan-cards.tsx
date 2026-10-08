"use client";

import Link from "next/link";
import { useState } from "react";
import { openUpgradeCheckout } from "@/lib/actions";
import { BillTermChoice, TermPrice } from "@/components/bill-term-choice";
import { SubmitButton } from "@/components/submit-button";
import { CATALOG, PLAN_POINTS, limitLabel, overflowLimit, planFamily, type BillTerm, type ProductPlan } from "@/lib/entitlements";

function daysLeftLabel(daysLeft: number) {
  if (daysLeft <= 0) return "Ends today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

function moveLabel(from: ProductPlan, to: ProductPlan) {
  const order = (plan: ProductPlan) => (plan === "pro" ? 0 : plan === "ultra" ? 1 : 2);
  const delta = order(to) - order(from);
  if (delta < 0) return "Downgrade";
  if (delta > 0) return "Upgrade";
  return "Change term";
}

export function DeskPlanCards({
  currentPlan,
  currentTerm = "monthly",
  customers,
  subscriberBase = 0,
  isOwner,
  onTrial = false,
  daysLeft = 0,
}: {
  currentPlan: ProductPlan;
  currentTerm?: BillTerm;
  customers: number;
  subscriberBase?: number;
  isOwner: boolean;
  onTrial?: boolean;
  daysLeft?: number;
}) {
  const [term, setTerm] = useState<BillTerm>(currentTerm);
  return (
    <>
      <BillTermChoice value={term} onChange={setTerm} />
      <section className="plan-pick">
        {(["pro", "ultra"] as ProductPlan[]).map((plan) => {
          const item = CATALOG[plan];
          const samePlan = plan === currentPlan;
          const sameOffer = samePlan && term === currentTerm;
          const payTrial = onTrial && sameOffer;
          const tooSmall = customers > item.customers;
          const move = moveLabel(currentPlan, plan);
          return (
            <article className={samePlan ? "card current" : "card"} key={plan}>
              <div className="plan-card-top">
                <p className="fine">{samePlan ? "Current plan" : move === "Downgrade" ? "Downgrade to" : "Upgrade to"}</p>
                <span className={onTrial && samePlan ? "trial-tab left" : "trial-tab"}>
                  {onTrial && samePlan ? daysLeftLabel(daysLeft) : `${item.trialDays}-day trial`}
                </span>
              </div>
              <h2>{item.label}</h2>
              <TermPrice monthly={item.price} term={term} />
              <ul className="plan-stats">
                <li>
                  <b>{limitLabel(item.customers)}</b>
                  <span>subscribers</span>
                </li>
                <li>
                  <b>{limitLabel(item.reminders)}</b>
                  <span>reminders</span>
                </li>
                <li>
                  <b>{limitLabel(item.staff)}</b>
                  <span>staff</span>
                </li>
              </ul>
              <p className="fine">
                Overflow to {limitLabel(overflowLimit(plan))} at ₹3 each. Extra staff ₹10 a month. Extra messages ₹0.50.
              </p>
              <ul className="plan-points">
                {PLAN_POINTS.filter((feature) => feature.plans.includes(planFamily(plan))).map((feature) => (
                  <li key={feature.label}>{feature.label}</li>
                ))}
              </ul>
              {!isOwner ? null : tooSmall ? (
                <p className="fine">This desk is larger than {item.label}.</p>
              ) : sameOffer && !payTrial ? null : (
                <form action={openUpgradeCheckout}>
                  <input type="hidden" name="product_plan" value={plan} />
                  <input type="hidden" name="billing_term" value={term} />
                  <SubmitButton className="btn small" pendingLabel="Opening payment…">
                    {payTrial ? "Pay now" : samePlan ? "Change term" : move}
                  </SubmitButton>
                </form>
              )}
              {!samePlan && !isOwner ? <p className="fine">Only the owner can switch plans.</p> : null}
            </article>
          );
        })}
        <article className={planFamily(currentPlan) === "premium" ? "card current" : "card"}>
          <div className="plan-card-top">
            <p className="fine">{planFamily(currentPlan) === "premium" ? "Current plan" : "Upgrade to"}</p>
            <span className={onTrial && planFamily(currentPlan) === "premium" ? "trial-tab left" : "trial-tab"}>
              {onTrial && planFamily(currentPlan) === "premium" ? daysLeftLabel(daysLeft) : `${CATALOG.premium_3000.trialDays}-day trial`}
            </span>
          </div>
          <h2>Premium</h2>
          <TermPrice monthly={CATALOG.premium_3000.price} term={term} from />
          <ul className="plan-stats">
            <li>
              <b>{limitLabel(CATALOG.premium_30000.customers)}</b>
              <span>subscribers</span>
            </li>
            <li>
              <b>20</b>
              <span>staff per 10,000</span>
            </li>
            <li>
              <b>₹3</b>
              <span>overflow each</span>
            </li>
          </ul>
          <p className="fine">The rate follows the subscriber base. Extra staff ₹10 a month. Extra messages ₹0.50.</p>
          <ul className="plan-points">
            {PLAN_POINTS.filter((feature) => feature.plans.includes("premium")).map((feature) => (
              <li key={feature.label}>{feature.label}</li>
            ))}
          </ul>
          {isOwner && onTrial && planFamily(currentPlan) === "premium" && term === currentTerm ? (
            <form action={openUpgradeCheckout}>
              <input type="hidden" name="product_plan" value="premium" />
              <input type="hidden" name="billing_term" value={term} />
              <input type="hidden" name="subscriber_base" value={subscriberBase} />
              <SubmitButton className="btn small" pendingLabel="Opening payment…">
                Pay now
              </SubmitButton>
            </form>
          ) : isOwner && !(planFamily(currentPlan) === "premium" && term === currentTerm) ? (
            <Link className="btn small" href={`/provider/upgrade/premium?term=${term}`}>
              {planFamily(currentPlan) === "premium" ? "Change term" : "Upgrade"}
            </Link>
          ) : !isOwner ? (
            <p className="fine">Only the owner can switch plans.</p>
          ) : null}
        </article>
      </section>
    </>
  );
}
