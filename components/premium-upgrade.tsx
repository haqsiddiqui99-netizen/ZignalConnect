"use client";

import Link from "next/link";
import { openUpgradeCheckout } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { CATALOG, limitLabel, overflowLimit, quotePremium } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { useState } from "react";

export function PremiumQuote({
  customers,
  staff,
  placeholder,
}: {
  customers: number;
  staff: number;
  placeholder: string;
}) {
  const [base, setBase] = useState("");
  const count = Number(base);
  const quote = base.trim() === "" ? null : quotePremium(count);
  const plan = quote?.ok ? CATALOG[quote.plan] : null;
  const tooSmall = Boolean(plan && (customers > plan.customers || staff > plan.staff));

  return (
    <form action={openUpgradeCheckout} className="stack">
      <input type="hidden" name="product_plan" value="premium" />
      <label className="field">
        <span>Subscriber base</span>
        <input
          className="quote-input"
          name="subscriber_base"
          type="number"
          min={1}
          required
          inputMode="numeric"
          placeholder={placeholder}
          value={base}
          onChange={(event) => setBase(event.target.value)}
          autoFocus
        />
      </label>
      {plan && quote?.ok ? (
        <div className="quote-panel">
          <p className="fine">Monthly rate</p>
          <p className="quote-price">{formatInr(plan.price)}</p>
          <p>
            {limitLabel(count)} subscribers is held on Premium for up to {limitLabel(plan.customers)}.
          </p>
          <p className="fine">
            {limitLabel(plan.reminders)} reminders · unlimited staff · {plan.trialDays}-day trial. Overflow to{" "}
            {limitLabel(overflowLimit(quote.plan))} at ₹3 each. Extra messages ₹0.50.
          </p>
        </div>
      ) : quote && !quote.ok && quote.custom ? (
        <div className="quote-panel">
          <p>A book above 30,000 subscribers is a custom offer.</p>
          <p className="fine">
            Zignal Connect prices that desk with you. Send the subscriber base to Zignal support and we will come back with the rate.
          </p>
          <Link className="btn small" href="/provider/support">
            Contact Zignal support
          </Link>
        </div>
      ) : quote && !quote.ok ? (
        <p className="fine">{quote.error}</p>
      ) : (
        <p className="fine">The monthly rate appears here once the subscriber base is entered.</p>
      )}
      {tooSmall ? (
        <p className="fine">
          This desk already has {limitLabel(customers)} customers and {limitLabel(staff)} staff. Enter a base that covers them.
        </p>
      ) : quote?.ok ? (
        <SubmitButton pendingLabel="Opening payment…">Continue to payment</SubmitButton>
      ) : null}
    </form>
  );
}
