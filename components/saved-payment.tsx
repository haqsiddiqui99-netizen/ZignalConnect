"use client";

import { useState } from "react";

const METHODS = [
  { value: "credit_card", title: "Credit card", detail: "Visa, Mastercard, RuPay", mark: "credit" },
  { value: "debit_card", title: "Debit card", detail: "Visa, Mastercard, RuPay", mark: "debit" },
  { value: "upi", title: "UPI", detail: "GPay, PhonePe, Paytm", mark: "upi" },
  { value: "net_banking", title: "Net banking", detail: "From your bank", mark: "bank" },
  { value: "auto_pay", title: "Auto-pay", detail: "Same method each month", mark: "auto" },
] as const;

type Method = (typeof METHODS)[number]["value"];
type Via = "credit_card" | "debit_card" | "upi";

export function SavedPaymentFields({
  method,
  via,
  holder,
  detail,
  expiry,
}: {
  method: string;
  via: string;
  holder: string;
  detail: string;
  expiry: string;
}) {
  const initial = METHODS.some((item) => item.value === method) ? (method as Method) : "credit_card";
  const initialVia: Via = via === "debit_card" || via === "upi" ? via : "credit_card";
  const [chosen, setChosen] = useState<Method>(initial);
  const [autopayVia, setAutopayVia] = useState<Via>(initialVia);
  const instrument = chosen === "auto_pay" ? autopayVia : chosen;
  const saved = method === "auto_pay" ? via : method;
  const card = instrument === "credit_card" || instrument === "debit_card";
  const savedCard = saved === "credit_card" || saved === "debit_card";

  return (
    <>
      <div className="pay-methods choices" role="radiogroup" aria-label="Preferred payment option">
        {METHODS.map((item) => (
          <label key={item.value} className={item.value === chosen ? "pay-method on" : "pay-method"}>
            <input
              type="radio"
              name="method"
              value={item.value}
              checked={item.value === chosen}
              onChange={() => setChosen(item.value)}
            />
            <span className="pay-mark" aria-hidden="true">
              <MethodMark kind={item.mark} />
            </span>
            <span className="pay-copy">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </span>
            <span className="pay-tick" aria-hidden="true" />
          </label>
        ))}
      </div>
      <div className="pay-sheet">
        {chosen === "auto_pay" ? (
          <label className="field">
            <span>Auto-pay with</span>
            <select name="via" value={autopayVia} onChange={(event) => setAutopayVia(event.target.value as Via)}>
              <option value="credit_card">Credit card</option>
              <option value="debit_card">Debit card</option>
              <option value="upi">UPI</option>
            </select>
          </label>
        ) : null}
        {card ? (
          <div className="pay-detail-grid">
            <label className="field">
              <span>Name on card</span>
              <input name="holder" defaultValue={savedCard ? holder : ""} autoComplete="off" maxLength={60} />
            </label>
            <label className="field">
              <span>Last 4 digits</span>
              <input name="last4" inputMode="numeric" defaultValue={savedCard ? detail : ""} autoComplete="off" maxLength={4} placeholder="4242" />
            </label>
            <label className="field">
              <span>Expiry</span>
              <input name="expiry" defaultValue={savedCard ? expiry : ""} autoComplete="off" maxLength={5} placeholder="MM/YY" />
            </label>
          </div>
        ) : null}
        {instrument === "upi" ? (
          <label className="field">
            <span>UPI ID</span>
            <input name="upi" defaultValue={saved === "upi" ? detail : ""} autoComplete="off" placeholder="name@okbank" />
          </label>
        ) : null}
        {instrument === "net_banking" ? (
          <div className="pay-detail-grid two">
            <label className="field">
              <span>Bank</span>
              <input name="bank" defaultValue={saved === "net_banking" ? detail : ""} autoComplete="off" maxLength={60} placeholder="HDFC Bank" />
            </label>
            <label className="field">
              <span>Account name</span>
              <input name="holder" defaultValue={saved === "net_banking" ? holder : ""} autoComplete="off" maxLength={60} />
            </label>
          </div>
        ) : null}
        <p className="fine">
          {chosen === "auto_pay"
            ? "Auto-pay is saved for the monthly desk fee. Nothing is charged until a payment gateway is connected."
            : "Only the last 4 digits of a card are saved. Nothing is charged when you save this."}
        </p>
      </div>
    </>
  );
}

function MethodMark({ kind }: { kind: "credit" | "debit" | "upi" | "bank" | "auto" }) {
  if (kind === "upi") {
    return (
      <svg viewBox="0 0 32 32" width="20" height="20">
        <text x="16" y="22" textAnchor="middle" fontFamily="Georgia, serif" fontSize="18" fill="currentColor">
          ₹
        </text>
      </svg>
    );
  }
  if (kind === "bank") {
    return (
      <svg viewBox="0 0 32 32" width="20" height="20">
        <path d="M6 13h20M8 13v9M13 13v9M19 13v9M24 13v9M5 22h22M16 6l11 7H5l11-7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "auto") {
    return (
      <svg viewBox="0 0 32 32" width="20" height="20">
        <path d="M8 16a8 8 0 0 1 13.5-5.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M24 16a8 8 0 0 1-13.5 5.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M20 7.5h3.2V11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 24.5H8.8V21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect x="3" y="7" width="26" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 13h26" stroke="currentColor" strokeWidth="1.7" />
      {kind === "debit" ? (
        <circle cx="11" cy="19.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      ) : (
        <path d="M7 20h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}
