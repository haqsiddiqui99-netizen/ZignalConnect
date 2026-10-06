"use client";

import { useState } from "react";
import { PREFERRED_BANKS, cardBrand } from "@/lib/pay-instrument";

const methods = [
  {
    value: "UPI",
    title: "UPI",
    detail: "GPay, PhonePe, Paytm, or any UPI ID",
    mark: "upi",
  },
  {
    value: "Card",
    title: "Debit or credit card",
    detail: "Visa, Mastercard, or RuPay",
    mark: "card",
  },
  {
    value: "Net banking",
    title: "Net banking",
    detail: "Pay from your bank account",
    mark: "bank",
  },
] as const;

export function PayMethods() {
  const [method, setMethod] = useState<(typeof methods)[number]["value"]>("UPI");

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
      {method === "UPI" ? <UpiFields /> : null}
      {method === "Card" ? <CardFields /> : null}
      {method === "Net banking" ? <BankFields /> : null}
    </>
  );
}

function UpiFields() {
  return (
    <label className="field pay-field">
      <span>UPI ID (optional)</span>
      <input name="upi" placeholder="name@okhdfcbank" autoComplete="off" inputMode="email" />
    </label>
  );
}

function CardFields() {
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const brand = cardBrand(number);

  return (
    <div className="pay-sheet">
      <label className="field pay-field">
        <span>Name on card</span>
        <input
          name="card_name"
          value={holder}
          autoComplete="cc-name"
          placeholder="As printed on the card"
          required
          onChange={(event) => setHolder(event.target.value)}
        />
      </label>
      <label className="field pay-field">
        <span>Card number{brand ? ` · ${brand}` : ""}</span>
        <input
          name="card_number"
          value={number}
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          required
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, "").slice(0, 19);
            setNumber((next.match(/.{1,4}/g) ?? []).join(" "));
          }}
        />
      </label>
      <div className="pay-pair">
        <label className="field pay-field">
          <span>Expiry</span>
          <input
            name="card_expiry"
            value={expiry}
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            required
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 4);
              setExpiry(next.length > 2 ? `${next.slice(0, 2)}/${next.slice(2)}` : next);
            }}
          />
        </label>
        <label className="field pay-field">
          <span>CVV</span>
          <input
            name="card_cvv"
            value={cvv}
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={brand === "Amex" ? "1234" : "123"}
            required
            onChange={(event) => setCvv(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </label>
      </div>
      <p className="fine">The card number and security code are not saved on this desk. They are only for the payment gateway.</p>
    </div>
  );
}

function BankFields() {
  const [bank, setBank] = useState("");
  return (
    <div className="pay-sheet">
      <label className="field pay-field">
        <span>Preferred bank</span>
        <select name="bank" value={bank} required onChange={(event) => setBank(event.target.value)}>
          <option value="" disabled>
            Choose a bank
          </option>
          {PREFERRED_BANKS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="Other">Other bank</option>
        </select>
      </label>
      {bank === "Other" ? (
        <label className="field pay-field">
          <span>Bank name</span>
          <input name="bank_other" placeholder="Enter the bank name" autoComplete="off" required />
        </label>
      ) : null}
    </div>
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
