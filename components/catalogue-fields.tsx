"use client";

import { useState } from "react";
import { TaxMode } from "@/components/tax-controls";

const ONE_TIME = new Set(["router", "installation", "service"]);
const PRESETS = new Set(["5", "12", "18", "22"]);

export function CatalogueTaxFields({ included, percent }: { included: boolean; percent: number }) {
  const starting = included || percent <= 0 ? "included" : PRESETS.has(String(percent)) ? String(percent) : "custom";
  const [tax, setTax] = useState(starting);
  const [custom, setCustom] = useState(starting === "custom" ? String(percent) : "");
  return <TaxMode label="Tax" name="tax" percentName="tax_percent" mode={tax} custom={custom} onMode={setTax} onCustom={setCustom} />;
}

export function DiscountAppliesFields({
  plans,
  applies,
  frequency,
}: {
  plans: { id: number; name: string; speed_mbps: number; price: number }[];
  applies: string;
  frequency: string;
}) {
  const fallback = plans[0] ? `plan:${plans[0].id}` : "invoice";
  const initial = applies || fallback;
  const [target, setTarget] = useState(initial);
  const [timing, setTiming] = useState(ONE_TIME.has(initial) ? "once" : frequency || "recurring");
  const locked = ONE_TIME.has(target);

  return (
    <>
      <label className="field">
        <span>Applies to</span>
        <select
          name="applies_to"
          required
          value={target}
          onChange={(event) => {
            const value = event.target.value;
            setTarget(value);
            if (ONE_TIME.has(value)) setTiming("once");
          }}
        >
          {plans.map((plan) => (
            <option key={plan.id} value={`plan:${plan.id}`}>
              {plan.name} · {plan.speed_mbps} Mbps · ₹{plan.price}
            </option>
          ))}
          <option value="router">Router charge</option>
          <option value="installation">Installation charge</option>
          <option value="service">Service charge</option>
          <option value="invoice">Full invoice</option>
        </select>
      </label>
      <label className="field">
        <span>Frequency</span>
        {locked ? <input type="hidden" name="frequency" value="once" /> : null}
        <select
          name={locked ? undefined : "frequency"}
          disabled={locked}
          className={locked ? "tax-locked" : undefined}
          value={locked ? "once" : timing}
          onChange={(event) => setTiming(event.target.value)}
        >
          <option value="once">One time</option>
          <option value="recurring">Always with Internet Plan</option>
        </select>
      </label>
    </>
  );
}
