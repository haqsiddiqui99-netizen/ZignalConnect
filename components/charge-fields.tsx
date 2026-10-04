"use client";

import { useEffect, useState } from "react";
import { BILL_CYCLES, cycleAmount } from "@/lib/bill-cycle";
import { TaxMode } from "@/components/tax-controls";
import { DISCOUNT_TARGETS, type ChargeKind } from "@/lib/charges";

const ONE_TIME_TARGETS = new Set(["router", "installation", "service"]);
const TAX_PRESET = new Set(["5", "12", "18", "22"]);

type CataloguePlan = { id: number; name: string; speed_mbps: number; price: number };
type CatalogueCharge = { id: number; name: string; kind: string; amount: number; taxIncluded: boolean; taxPercent: number };
type CatalogueOffer = { id: number; name: string; applies: string; frequency: "once" | "recurring"; mode: "amount" | "percent"; value: number };
type PlanRow = { key: number; planId: string; customName: string; frequency: string; amount: string; tax: string; customTax: string };
type ChargeRow = { key: number; source: "catalogue" | "custom"; catalogueId: string; kind: ChargeKind; label: string; frequency: string; amount: string; tax: string; customTax: string };
type DiscountRow = { key: number; pick: string; applies: string; frequency: "once" | "recurring"; mode: "amount" | "percent"; name: string; value: string };

function chargeKind(value: string): ChargeKind {
  if (value === "router" || value === "installation" || value === "service" || value === "other") return value;
  return "other";
}

function taxFromCatalogue(included: boolean, percent: number) {
  if (included || percent <= 0) return { tax: "included", customTax: "" };
  const text = String(percent);
  return TAX_PRESET.has(text) ? { tax: text, customTax: text } : { tax: "custom", customTax: text };
}

function planLabel(plan: CataloguePlan) {
  return `${plan.name} · ${plan.speed_mbps} Mbps · ₹${plan.price}`;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="field">
      <span aria-hidden="true">&nbsp;</span>
      <button type="button" className="row-trash" aria-label={label} onClick={onClick}>
        ×
      </button>
    </div>
  );
}

export function ChargeFields({ plans, charges = [], offers = [] }: { plans: CataloguePlan[]; charges?: CatalogueCharge[]; offers?: CatalogueOffer[] }) {
  const firstId = String(plans[0]?.id ?? "");

  function derivedAmount(planId: string, frequency: string) {
    const plan = plans.find((item) => String(item.id) === planId);
    return plan ? String(cycleAmount(plan.price, frequency)) : "";
  }

  const [planRows, setPlanRows] = useState<PlanRow[]>([
    { key: 0, planId: firstId, customName: "", frequency: "monthly", amount: derivedAmount(firstId, "monthly"), tax: "included", customTax: "" },
  ]);
  const [rows, setRows] = useState<ChargeRow[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  function addPlan() {
    setPlanRows((current) => [
      ...current,
      { key: nextKey, planId: firstId, customName: "", frequency: "monthly", amount: derivedAmount(firstId, "monthly"), tax: "included", customTax: "" },
    ]);
    setNextKey((key) => key + 1);
  }

  function updatePlan(key: number, patch: Partial<PlanRow>) {
    setPlanRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function chargeFields(charge: CatalogueCharge | undefined): Omit<ChargeRow, "key"> {
    if (!charge) {
      return { source: "catalogue", catalogueId: "", kind: "other", label: "", frequency: "once", amount: "", tax: "included", customTax: "" };
    }
    return {
      source: "catalogue",
      catalogueId: String(charge.id),
      kind: chargeKind(charge.kind),
      label: charge.name,
      frequency: "once",
      amount: String(charge.amount),
      ...taxFromCatalogue(charge.taxIncluded, charge.taxPercent),
    };
  }

  function addCharge() {
    const first = charges[0];
    setRows((current) => [
      ...current,
      first
        ? { key: nextKey, ...chargeFields(first) }
        : { key: nextKey, source: "custom", catalogueId: "__custom__", kind: "other", label: "", frequency: "once", amount: "", tax: "included", customTax: "" },
    ]);
    setNextKey((key) => key + 1);
  }

  function update(key: number, patch: Partial<ChargeRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function offerFields(offer: CatalogueOffer | undefined): Pick<DiscountRow, "pick" | "name" | "applies" | "frequency" | "mode" | "value"> {
    const firstPlan = planRows[0]?.planId === "__custom__" ? "" : planRows[0]?.planId || firstId;
    const fallback = firstPlan ? `plan:${firstPlan}` : "invoice";
    if (!offer) {
      return { pick: "__custom__", name: "", applies: fallback, frequency: "recurring", mode: "amount", value: "" };
    }
    const applies = offer.applies;
    return {
      pick: offer.name,
      name: offer.name,
      applies,
      frequency: ONE_TIME_TARGETS.has(applies) ? "once" : offer.frequency,
      mode: offer.mode,
      value: String(offer.value),
    };
  }

  function addDiscount() {
    setDiscounts((current) => [...current, { key: nextKey, ...offerFields(offers[0]) }]);
    setNextKey((key) => key + 1);
  }

  function updateDiscount(key: number, patch: Partial<DiscountRow>) {
    setDiscounts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function chooseApplies(key: number, applies: string) {
    updateDiscount(key, ONE_TIME_TARGETS.has(applies) ? { applies, frequency: "once" } : { applies });
  }

  const planChoices = plans.map((plan) => ({ value: `plan:${plan.id}`, label: planLabel(plan) }));
  const applyChoices = [...planChoices, ...DISCOUNT_TARGETS.filter((item) => item.value !== "plan" && item.value !== "other")];
  const planKey = planChoices.map((item) => item.value).join("|");

  useEffect(() => {
    const allowed = new Set(applyChoices.map((item) => item.value));
    const fallback = applyChoices[0]?.value ?? "invoice";
    setDiscounts((current) => {
      let changed = false;
      const next = current.map((row) => {
        const applies = allowed.has(row.applies) ? row.applies : fallback;
        const frequency = ONE_TIME_TARGETS.has(applies) ? "once" : row.frequency;
        if (applies === row.applies && frequency === row.frequency) return row;
        changed = true;
        return { ...row, applies, frequency };
      });
      return changed ? next : current;
    });
  }, [planKey]);

  return (
    <div className="stack">
      {planRows.map((row) => {
        return (
          <div key={row.key} className="bill-row">
            <label className="field">
              <span>Internet Plan</span>
              <select
                name="plan_id"
                required
                value={row.planId}
                onChange={(event) => {
                  const planId = event.target.value;
                  updatePlan(
                    row.key,
                    planId === "__custom__"
                      ? { planId, customName: "", amount: "" }
                      : { planId, customName: "", amount: derivedAmount(planId, row.frequency) },
                  );
                }}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.speed_mbps} Mbps · ₹{plan.price}
                  </option>
                ))}
                <option value="__custom__">Custom</option>
              </select>
              {row.planId === "__custom__" ? (
                <input
                  name="plan_custom_name"
                  required
                  maxLength={40}
                  value={row.customName}
                  placeholder="Plan name"
                  onChange={(event) => updatePlan(row.key, { customName: event.target.value })}
                />
              ) : (
                <input type="hidden" name="plan_custom_name" value="" />
              )}
            </label>
            <label className="field">
              <span>Frequency</span>
              <select
                name="plan_cycle"
                value={row.frequency}
                onChange={(event) =>
                  updatePlan(row.key, {
                    frequency: event.target.value,
                    amount: row.planId === "__custom__" ? row.amount : derivedAmount(row.planId, event.target.value),
                  })
                }
              >
                {BILL_CYCLES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Amount (₹)</span>
              <input name="plan_amount" type="number" min={1} step={1} required value={row.amount} onChange={(event) => updatePlan(row.key, { amount: event.target.value })} />
            </label>
            <TaxMode
              label="Tax"
              name="plan_tax"
              percentName="plan_tax_percent"
              mode={row.tax}
              custom={row.customTax}
              onMode={(tax) => updatePlan(row.key, { tax })}
              onCustom={(customTax) => updatePlan(row.key, { customTax })}
            />
            <RemoveButton label="Remove plan" onClick={() => setPlanRows((current) => current.filter((item) => item.key !== row.key))} />
          </div>
        );
      })}
      {rows.map((row) => (
        <div key={row.key} className="charge-row">
          <label className="field">
            <span>Charge</span>
            <input type="hidden" name="charge_kind" value={row.source === "custom" ? "other" : row.kind} />
            <select
              required
              value={row.source === "custom" ? "__custom__" : row.catalogueId}
              onChange={(event) => {
                if (event.target.value === "__custom__") {
                  update(row.key, { source: "custom", catalogueId: "__custom__", kind: "other", label: "", frequency: "once", amount: "", tax: "included", customTax: "" });
                  return;
                }
                const charge = charges.find((item) => String(item.id) === event.target.value);
                update(row.key, chargeFields(charge));
              }}
            >
              {charges.map((charge) => (
                <option key={charge.id} value={charge.id}>
                  {charge.name}
                </option>
              ))}
              <option value="__custom__">Custom</option>
            </select>
            {row.source === "custom" ? (
              <input
                name="charge_label"
                required
                maxLength={40}
                value={row.label}
                placeholder="Charge name"
                onChange={(event) => update(row.key, { label: event.target.value })}
              />
            ) : (
              <input type="hidden" name="charge_label" value={row.label} />
            )}
          </label>
          <label className="field">
            <span>Frequency</span>
            {row.source === "catalogue" ? <input type="hidden" name="charge_frequency" value="once" /> : null}
            <select
              name={row.source === "catalogue" ? undefined : "charge_frequency"}
              disabled={row.source === "catalogue"}
              className={row.source === "catalogue" ? "tax-locked" : undefined}
              value={row.source === "catalogue" ? "once" : row.frequency}
              onChange={(event) => update(row.key, { frequency: event.target.value })}
            >
              <option value="once">One-time</option>
              {row.source === "custom"
                ? BILL_CYCLES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))
                : null}
            </select>
          </label>
          <label className="field">
            <span>Amount (₹)</span>
            <input
              name="charge_amount"
              type="number"
              min={1}
              step={1}
              required
              value={row.amount}
              onChange={(event) => update(row.key, { amount: event.target.value })}
            />
          </label>
          <TaxMode
            label="Tax"
            name="charge_tax"
            percentName="charge_tax_percent"
            mode={row.tax}
            custom={row.customTax}
            onMode={(tax) => update(row.key, { tax })}
            onCustom={(customTax) => update(row.key, { customTax })}
          />
          <RemoveButton label="Remove charge" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} />
        </div>
      ))}
      {discounts.map((row) => (
        <div key={row.key} className="discount-row">
          <label className="field">
            <span>Discount</span>
            <select
              required
              value={row.pick}
              onChange={(event) => {
                if (event.target.value === "__custom__") {
                  updateDiscount(row.key, offerFields(undefined));
                  return;
                }
                const offer = offers.find((item) => item.name === event.target.value);
                updateDiscount(row.key, offerFields(offer));
              }}
            >
              {offers.map((offer) => (
                <option key={offer.id} value={offer.name}>
                  {offer.name}
                </option>
              ))}
              <option value="__custom__">Custom</option>
            </select>
            {row.pick === "__custom__" ? (
              <input
                name="discount_name"
                required
                maxLength={40}
                value={row.name}
                placeholder="Discount name"
                onChange={(event) => updateDiscount(row.key, { name: event.target.value })}
              />
            ) : (
              <input type="hidden" name="discount_name" value={row.name} />
            )}
          </label>
          <label className="field">
            <span>Applies to</span>
            <select name="discount_applies" value={row.applies} onChange={(event) => chooseApplies(row.key, event.target.value)}>
              {applyChoices.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Frequency</span>
            {ONE_TIME_TARGETS.has(row.applies) ? <input type="hidden" name="discount_frequency" value="once" /> : null}
            <select
              name={ONE_TIME_TARGETS.has(row.applies) ? undefined : "discount_frequency"}
              value={ONE_TIME_TARGETS.has(row.applies) ? "once" : row.frequency}
              disabled={ONE_TIME_TARGETS.has(row.applies)}
              className={ONE_TIME_TARGETS.has(row.applies) ? "tax-locked" : undefined}
              onChange={(event) => updateDiscount(row.key, { frequency: event.target.value === "once" ? "once" : "recurring" })}
            >
              <option value="once">One time</option>
              <option value="recurring">Always with Internet Plan (Recurring)</option>
            </select>
          </label>
          <label className="field">
            <span>Basis</span>
            <select
              name="discount_mode"
              value={row.mode}
              onChange={(event) => updateDiscount(row.key, { mode: event.target.value === "amount" ? "amount" : "percent" })}
            >
              <option value="percent">Percent (%)</option>
              <option value="amount">Amount (₹)</option>
            </select>
          </label>
          <label className="field">
            <span>{row.mode === "percent" ? "Percent" : "Amount (₹)"}</span>
            <input
              name="discount_value"
              type="number"
              min={1}
              max={row.mode === "percent" ? 100 : undefined}
              step={1}
              required
              value={row.value}
              onChange={(event) => updateDiscount(row.key, { value: event.target.value })}
            />
          </label>
          <RemoveButton label="Remove discount" onClick={() => setDiscounts((current) => current.filter((item) => item.key !== row.key))} />
        </div>
      ))}
      <strong>Add more charges</strong>
      <div className="addon-row">
        <button type="button" className="btn small" onClick={addPlan}>
          Add Internet Plan
        </button>
        <button type="button" className="btn small" onClick={addCharge}>
          Add Charge
        </button>
        <button type="button" className="btn small" onClick={addDiscount}>
          Add Discount
        </button>
      </div>
    </div>
  );
}
