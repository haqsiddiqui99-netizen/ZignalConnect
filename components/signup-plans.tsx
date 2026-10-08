"use client";

import { useState } from "react";
import {
  CATALOG,
  PLAN_POINTS,
  PREMIUM_PLANS,
  limitLabel,
  overflowLimit,
  type ProductPlan,
} from "@/lib/entitlements";
import { BillTermChoice, TermPrice } from "@/components/bill-term-choice";
import type { BillTerm } from "@/lib/entitlements";

type Family = "pro" | "ultra" | "premium";

function familyFor(count: number): Family {
  if (count <= CATALOG.pro.customers) return "pro";
  if (count <= CATALOG.ultra.customers) return "ultra";
  return "premium";
}

function premiumPlan(count: number): ProductPlan {
  return PREMIUM_PLANS.find((plan) => count <= CATALOG[plan].customers) ?? "premium_30000";
}

function pointsFor(family: Family) {
  return PLAN_POINTS.filter((point) => point.plans.includes(family)).map((point) => point.label);
}

export function SignupPlans() {
  const [base, setBase] = useState("");
  const [chosen, setChosen] = useState<Family | "">("");
  const [term, setTerm] = useState<BillTerm>("monthly");
  const count = Number(base);
  const known = base.trim() !== "" && Number.isInteger(count) && count >= 1;
  const fit = known ? familyFor(count) : "";
  const selected = known ? chosen : "";
  const premiumId = known ? premiumPlan(count) : "premium_3000";
  const premiumTier = CATALOG[premiumId];

  function onBase(value: string) {
    setBase(value);
    const next = Number(value);
    if (value.trim() === "" || !Number.isInteger(next) || next < 1) {
      setChosen("");
      return;
    }
    setChosen(familyFor(next));
  }

  const proBlocked = known && count > CATALOG.pro.customers;
  const ultraBlocked = known && count > CATALOG.ultra.customers;

  return (
    <>
      <div className="signup-base">
        <label className="field">
          <span>Subscriber base</span>
          <input
            name="subscriber_base"
            type="number"
            min={1}
            required
            placeholder="500"
            value={base}
            onChange={(event) => onBase(event.target.value)}
          />
        </label>
      </div>
      <BillTermChoice value={term} onChange={setTerm} />
      <fieldset className="plan-pick signup-plans">
        <legend className="fine">Plan for that book</legend>
        <label className="card plan-option">
          <input
            type="radio"
            name="product_plan"
            value="pro"
            checked={selected === "pro"}
            disabled={proBlocked}
            required
            onChange={() => setChosen("pro")}
          />
          <div className="plan-card-top">
            <p className="fine">
              <span className="when-idle">{proBlocked ? "Too small" : "Choose"}</span>
              <span className="when-picked">Selected</span>
            </p>
            <span className="trial-tab">{CATALOG.pro.trialDays}-day trial</span>
          </div>
          <h2>{CATALOG.pro.label}</h2>
          <TermPrice monthly={CATALOG.pro.price} term={term} />
          <ul className="plan-stats">
            <li>
              <b>{limitLabel(CATALOG.pro.customers)}</b>
              <span>subscribers</span>
            </li>
            <li>
              <b>{limitLabel(CATALOG.pro.reminders)}</b>
              <span>reminders</span>
            </li>
            <li>
              <b>{limitLabel(CATALOG.pro.staff)}</b>
              <span>staff</span>
            </li>
          </ul>
          <p className="fine">
            Overflow to {limitLabel(overflowLimit("pro"))} at ₹3 each. Extra staff ₹10 a month. Extra messages ₹0.50.
          </p>
          <ul className="plan-points">
            {pointsFor("pro").map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </label>
        <label className="card plan-option">
          <input
            type="radio"
            name="product_plan"
            value="ultra"
            checked={selected === "ultra"}
            disabled={ultraBlocked}
            required
            onChange={() => setChosen("ultra")}
          />
          <div className="plan-card-top">
            <p className="fine">
              <span className="when-idle">{ultraBlocked ? "Too small" : "Choose"}</span>
              <span className="when-picked">Selected</span>
            </p>
            <span className="trial-tab">{CATALOG.ultra.trialDays}-day trial</span>
          </div>
          <h2>{CATALOG.ultra.label}</h2>
          <TermPrice monthly={CATALOG.ultra.price} term={term} />
          <ul className="plan-stats">
            <li>
              <b>{limitLabel(CATALOG.ultra.customers)}</b>
              <span>subscribers</span>
            </li>
            <li>
              <b>{limitLabel(CATALOG.ultra.reminders)}</b>
              <span>reminders</span>
            </li>
            <li>
              <b>{limitLabel(CATALOG.ultra.staff)}</b>
              <span>staff</span>
            </li>
          </ul>
          <p className="fine">
            Overflow to {limitLabel(overflowLimit("ultra"))} at ₹3 each. Extra staff ₹10 a month. Extra messages ₹0.50.
          </p>
          <ul className="plan-points">
            {pointsFor("ultra").map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </label>
        <label className="card plan-option">
          <input
            type="radio"
            name="product_plan"
            value={premiumId}
            checked={selected === "premium"}
            required
            onChange={() => setChosen("premium")}
          />
          <div className="plan-card-top">
            <p className="fine">
              <span className="when-idle">Choose</span>
              <span className="when-picked">Selected</span>
            </p>
            <span className="trial-tab">{CATALOG.premium_3000.trialDays}-day trial</span>
          </div>
          <h2>Premium</h2>
          {known && selected === "premium" ? (
            <TermPrice monthly={premiumTier.price} term={term} />
          ) : (
            <TermPrice monthly={CATALOG.premium_3000.price} term={term} from />
          )}
          <ul className="plan-stats">
            <li>
              <b>{limitLabel(premiumTier.customers)}</b>
              <span>subscribers</span>
            </li>
            <li>
              <b>{limitLabel(premiumTier.staff)}</b>
              <span>staff</span>
            </li>
            <li>
              <b>₹3</b>
              <span>overflow each</span>
            </li>
          </ul>
          <p className="fine">
            {known && count > CATALOG.premium_30000.customers
              ? `A book above ${limitLabel(CATALOG.premium_30000.customers)} stays on Premium. `
              : "The rate follows the subscriber base. "}
            Extra staff ₹10 a month. Extra messages ₹0.50.
          </p>
          <ul className="plan-points">
            {pointsFor("premium").map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </label>
      </fieldset>
      {known && fit ? (
        <p className="fine">
          A book of {count.toLocaleString("en-IN")} opens on {fit === "premium" ? "Premium" : CATALOG[fit].label}.
          {selected && selected !== fit ? ` ${selected === "premium" ? "Premium" : CATALOG[selected].label} is selected.` : ""}
        </p>
      ) : (
        <p className="fine">Enter the subscriber base. Pro holds up to 500, Ultra up to 1,000, and anything above 1,000 is Premium.</p>
      )}
    </>
  );
}
