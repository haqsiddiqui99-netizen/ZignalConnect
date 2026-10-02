"use client";

import { useState } from "react";

export type SignupPlan = {
  id: string;
  label: string;
  price: string;
  customers: number;
  line: string;
  overflow: string;
  blurb: string;
  points: string[];
};

export function SignupPlans({ plans }: { plans: SignupPlan[] }) {
  const [base, setBase] = useState("");
  const [picked, setPicked] = useState(plans[0]?.id ?? "pro");
  const count = Number(base);
  const known = base.trim() !== "" && Number.isInteger(count) && count >= 1;
  const ceiling = plans[plans.length - 1]?.customers ?? 0;
  const over = known && count > ceiling;
  const floor = plans.find((plan) => count <= plan.customers);
  const held = plans.find((plan) => plan.id === picked && (!known || plan.customers >= count));
  const selected = over ? "" : held?.id ?? floor?.id ?? "";

  return (
    <>
      <div className="signup-fields">
        <label className="field">
          <span>Subscriber base</span>
          <input
            name="subscriber_base"
            type="number"
            min={1}
            max={ceiling || 30000}
            required
            placeholder="500"
            value={base}
            onChange={(event) => setBase(event.target.value)}
          />
        </label>
      </div>
      <fieldset className="plan-pick signup-plans">
        <legend className="fine">Plan for that book</legend>
        {plans.map((plan) => {
          const blocked = known && count > plan.customers;
          return (
            <label className="card plan-option" key={plan.id}>
              <input
                type="radio"
                name="product_plan"
                value={plan.id}
                checked={plan.id === selected}
                disabled={blocked || over}
                required
                onChange={() => setPicked(plan.id)}
              />
              <p className="fine">
                <span className="when-idle">{blocked ? "Too small" : "Choose"}</span>
                <span className="when-picked">Selected</span>
              </p>
              <h2>{plan.label}</h2>
              <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
                {plan.price}
              </p>
              <p className="fine">per month</p>
              <p style={{ margin: "10px 0" }}>{plan.blurb}</p>
              <p className="fine">{plan.line}</p>
              <p className="fine">{plan.overflow}</p>
              <ul className="fine" style={{ paddingLeft: 18 }}>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </label>
          );
        })}
      </fieldset>
      {over ? (
        <p className="fine">The largest desk is {plans[plans.length - 1]?.label}. A book of {count.toLocaleString("en-IN")} does not fit.</p>
      ) : known && floor ? (
        <p className="fine">
          A book of {count.toLocaleString("en-IN")} opens on {floor.label}. Larger tiers stay open.
        </p>
      ) : null}
    </>
  );
}
