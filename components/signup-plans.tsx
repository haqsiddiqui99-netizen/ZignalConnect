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
import { formatInr } from "@/lib/format";

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
          <p className="fine">
            <span className="when-idle">{proBlocked ? "Too small" : "Choose"}</span>
            <span className="when-picked">Selected</span>
          </p>
          <h2>{CATALOG.pro.label}</h2>
          <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
            {formatInr(CATALOG.pro.price)}
          </p>
          <p className="fine">per month</p>
          <p style={{ margin: "10px 0" }}>{CATALOG.pro.blurb}</p>
          <p className="fine">
            {limitLabel(CATALOG.pro.customers)} customers · {limitLabel(CATALOG.pro.reminders)} reminders ·{" "}
            {limitLabel(CATALOG.pro.staff)} staff · {CATALOG.pro.trialDays}-day trial
          </p>
          <p className="fine">
            Overflow to {limitLabel(overflowLimit("pro"))} at ₹3 each. Extra staff ₹10 each per month. Extra messages ₹0.50.
          </p>
          <ul className="fine" style={{ paddingLeft: 18 }}>
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
          <p className="fine">
            <span className="when-idle">{ultraBlocked ? "Too small" : "Choose"}</span>
            <span className="when-picked">Selected</span>
          </p>
          <h2>{CATALOG.ultra.label}</h2>
          <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
            {formatInr(CATALOG.ultra.price)}
          </p>
          <p className="fine">per month</p>
          <p style={{ margin: "10px 0" }}>{CATALOG.ultra.blurb}</p>
          <p className="fine">
            {limitLabel(CATALOG.ultra.customers)} customers · {limitLabel(CATALOG.ultra.reminders)} reminders ·{" "}
            {limitLabel(CATALOG.ultra.staff)} staff · {CATALOG.ultra.trialDays}-day trial
          </p>
          <p className="fine">
            Overflow to {limitLabel(overflowLimit("ultra"))} at ₹3 each. Extra staff ₹10 each per month. Extra messages ₹0.50.
          </p>
          <ul className="fine" style={{ paddingLeft: 18 }}>
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
          <p className="fine">
            <span className="when-idle">Choose</span>
            <span className="when-picked">Selected</span>
          </p>
          <h2>Premium</h2>
          <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
            {known && selected === "premium" ? formatInr(premiumTier.price) : `from ${formatInr(CATALOG.premium_3000.price)}`}
          </p>
          <p className="fine">per month, set from the subscriber base</p>
          <p style={{ margin: "10px 0" }}>
            20 staff for every 10,000 subscribers. Extra staff are ₹10 each per month. The rate is worked out from the subscriber base.
          </p>
          <p className="fine">
            {known && count > CATALOG.premium_30000.customers
              ? `A book above ${limitLabel(CATALOG.premium_30000.customers)} stays on Premium.`
              : `Up to ${limitLabel(premiumTier.customers)} customers · ${limitLabel(premiumTier.staff)} staff · ${premiumTier.trialDays}-day trial`}
          </p>
          <p className="fine">Overflow at ₹3 each. Extra staff ₹10 each per month. Extra messages ₹0.50.</p>
          <ul className="fine" style={{ paddingLeft: 18 }}>
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
