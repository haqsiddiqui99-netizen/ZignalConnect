"use client";

import { BILL_TERMS, termQuote, type BillTerm } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";

export function BillTermChoice({ value, onChange }: { value: BillTerm; onChange: (term: BillTerm) => void }) {
  return (
    <div className="bill-terms">
      {BILL_TERMS.map((item) => (
        <label key={item.id} className={value === item.id ? "picked" : undefined}>
          <input type="radio" name="billing_term" value={item.id} checked={value === item.id} onChange={() => onChange(item.id)} />
          <strong>{item.label}</strong>
          <span className="fine">{item.note}</span>
        </label>
      ))}
    </div>
  );
}

export function TermPrice({ monthly, term, from = false }: { monthly: number; term: BillTerm; from?: boolean }) {
  const quote = termQuote(monthly, term);
  const period = term === "yearly" ? "per year" : term === "quarterly" ? "every 3 months" : "per month";
  return (
    <div className="plan-price">
      <p className="hero-price">{from ? `from ${formatInr(quote.due)}` : formatInr(quote.due)}</p>
      <p className="fine">
        {period}
        {quote.save > 0 ? ` · ${formatInr(quote.perMonth)} a month` : ""}
      </p>
      {quote.save > 0 ? (
        <p className="plan-save">
          Save {quote.percent}% · {formatInr(quote.save)} less than paying monthly
        </p>
      ) : null}
    </div>
  );
}
