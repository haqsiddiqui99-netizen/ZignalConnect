export const PREFERRED_BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "IDBI Bank",
  "IDFC FIRST Bank",
  "Yes Bank",
  "IndusInd Bank",
  "Federal Bank",
  "South Indian Bank",
  "Karnataka Bank",
  "AU Small Finance Bank",
] as const;

export type GatewayPayment =
  | { method: "UPI"; detail: string; upi: string }
  | { method: "Card"; detail: string; holder: string; number: string; expiry: string; cvv: string }
  | { method: "Net banking"; detail: string; bank: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function cardBrand(number: string) {
  const card = digits(number);
  if (/^4/.test(card)) return "Visa";
  if (/^3[47]/.test(card)) return "Amex";
  if (/^(5[1-5]|2[2-7])/.test(card)) return "Mastercard";
  if (/^(60|65|81|82|508)/.test(card)) return "RuPay";
  return "";
}

function luhn(card: string) {
  let sum = 0;
  let double = false;
  for (let index = card.length - 1; index >= 0; index -= 1) {
    let digit = card.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function expiryValid(value: string) {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const now = new Date();
  const end = new Date(year, month, 0, 23, 59, 59);
  return end >= new Date(now.getFullYear(), now.getMonth(), 1);
}

export function readGatewayPayment(formData: FormData): { ok: true; payment: GatewayPayment } | { ok: false; error: string } {
  const method = text(formData, "method");
  if (method === "UPI") {
    const upi = text(formData, "upi");
    if (upi && !/^[a-zA-Z0-9._-]{2,40}@[a-zA-Z]{2,30}$/.test(upi)) {
      return { ok: false, error: "Enter a UPI ID like name@okhdfcbank." };
    }
    return { ok: true, payment: { method, detail: upi, upi } };
  }
  if (method === "Card") {
    const holder = text(formData, "card_name");
    const number = digits(text(formData, "card_number"));
    const expiry = text(formData, "card_expiry");
    const cvv = digits(text(formData, "card_cvv"));
    if (!/^[A-Za-z][A-Za-z .'-]{1,39}$/.test(holder)) {
      return { ok: false, error: "Enter the name on the card." };
    }
    const brand = cardBrand(number);
    const lengthOk = brand === "Amex" ? number.length === 15 : number.length >= 13 && number.length <= 19;
    if (!lengthOk || !luhn(number)) return { ok: false, error: "Enter the full card number." };
    if (!expiryValid(expiry)) return { ok: false, error: "Enter the expiry as MM/YY." };
    const cvvOk = brand === "Amex" ? cvv.length === 4 : cvv.length === 3;
    if (!cvvOk) return { ok: false, error: "Enter the security code on the card." };
    const label = brand || "Card";
    return {
      ok: true,
      payment: { method, detail: `${label} ···· ${number.slice(-4)}`, holder, number, expiry, cvv },
    };
  }
  if (method === "Net banking") {
    const picked = text(formData, "bank");
    const bank = picked === "Other" ? text(formData, "bank_other").replace(/\s+/g, " ") : picked;
    const listed = PREFERRED_BANKS.includes(bank as (typeof PREFERRED_BANKS)[number]);
    if (!listed && (picked !== "Other" || bank.length < 2 || bank.length > 40)) {
      return { ok: false, error: picked === "Other" ? "Enter the bank name." : "Choose a bank." };
    }
    return { ok: true, payment: { method, detail: bank, bank } };
  }
  return { ok: false, error: "Choose how you want to pay." };
}
