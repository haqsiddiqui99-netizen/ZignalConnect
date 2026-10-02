"use client";

import { useState } from "react";

const methods = [
  {
    value: "UPI",
    title: "UPI",
    detail: "GPay, PhonePe, Paytm, or any UPI ID",
    field: "UPI ID",
    placeholder: "name@okhdfcbank",
    mark: "upi",
  },
  {
    value: "Card",
    title: "Debit or credit card",
    detail: "Visa, Mastercard, or RuPay",
    field: "Card last 4 digits",
    placeholder: "4242",
    mark: "card",
  },
  {
    value: "Net banking",
    title: "Net banking",
    detail: "Pay from your bank account",
    field: "Bank reference",
    placeholder: "HDFC or transfer reference",
    mark: "bank",
  },
] as const;

export function PayMethods() {
  const [method, setMethod] = useState<(typeof methods)[number]["value"]>("UPI");
  const chosen = methods.find((item) => item.value === method) ?? methods[0];

  return (
    <>
      <div className="pay-methods" role="radiogroup" aria-label="How to pay">
        {methods.map((item) => (
          <label key={item.value} className={item.value === method ? "pay-method on" : "pay-method"}>
            <input
              type="radio"
              name="method"
              value={item.value}
              checked={item.value === method}
              onChange={() => setMethod(item.value)}
            />
            <span className={`pay-mark pay-mark-${item.mark}`} aria-hidden="true">
              {item.mark === "upi" ? <UpiMark /> : item.mark === "card" ? <CardMark /> : <BankMark />}
            </span>
            <span className="pay-copy">
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </span>
            <span className="pay-tick" aria-hidden="true" />
          </label>
        ))}
      </div>
      <label className="field">
        <span>{chosen.field} (optional)</span>
        <input name="detail" placeholder={chosen.placeholder} autoComplete="off" />
      </label>
    </>
  );
}

function UpiMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22">
      <text x="16" y="21" textAnchor="middle" fontFamily="Georgia, serif" fontSize="16" fill="currentColor">
        ₹
      </text>
    </svg>
  );
}

function CardMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22">
      <rect x="3" y="7" width="26" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 13h26" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 20h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BankMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22">
      <path d="M6 13h20M8 13v9M13 13v9M19 13v9M24 13v9M5 22h22M16 6l11 7H5l11-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
