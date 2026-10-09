export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const BELOW_20 = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function cleanGstin(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isGstin(value: string) {
  return value === "" || GSTIN.test(value);
}

export function isIndianState(value: string) {
  return value === "" || INDIAN_STATES.includes(value);
}

function below100(n: number) {
  if (n < 20) return BELOW_20[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one ? `${TENS[ten]}-${BELOW_20[one]}` : TENS[ten];
}

function below1000(n: number) {
  if (n < 100) return below100(n);
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${BELOW_20[hundred]} hundred ${below100(rest)}` : `${BELOW_20[hundred]} hundred`;
}

export function inrWords(amount: number) {
  const n = Math.round(amount);
  if (n === 0) return "Zero rupees only";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${below1000(crore)} crore`);
  if (lakh) parts.push(`${below100(lakh)} lakh`);
  if (thousand) parts.push(`${below1000(thousand)} thousand`);
  if (rest) parts.push(below1000(rest));
  const text = parts.join(" ");
  return `Rupees ${text.charAt(0).toUpperCase()}${text.slice(1)} only`;
}

function paise(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function gstOnTop(taxable: number) {
  const cgst = paise((taxable * 9) / 100);
  const sgst = cgst;
  const tax = paise(cgst + sgst);
  return { taxable: paise(taxable), tax, cgst, sgst, igst: tax, total: paise(taxable + tax) };
}

export function priceAndTax(amount: number, included: boolean, percent: number, label: string) {
  const rate = percent > 0 ? percent : 18;
  const halfText = String(rate / 2);
  if (amount <= 0 || rate <= 0) return { price: paise(amount), taxLines: [] as { description: string; amount: number }[] };
  const split = included ? gstIncluded(amount, rate) : gstOnRate(amount, rate);
  return {
    price: split.taxable,
    taxLines: [
      { description: `CGST ${halfText}% on ${label}`, amount: split.cgst },
      { description: `SGST ${halfText}% on ${label}`, amount: split.sgst },
    ].filter((line) => line.amount !== 0),
  };
}

function gstOnRate(amount: number, rate: number) {
  const cgst = paise((amount * (rate / 2)) / 100);
  const sgst = cgst;
  const tax = paise(cgst + sgst);
  return { taxable: paise(amount), tax, cgst, sgst, igst: tax, total: paise(amount + tax) };
}

export function addGstLines(base: number, label: string) {
  return priceAndTax(base, false, 18, label).taxLines;
}

export type InvoiceTotals = {
  subtotal: number;
  cgst: number;
  sgst: number;
  rate: number;
  grand: number;
};

export function invoiceTotals(gross: number, included: boolean, percent: number): InvoiceTotals {
  const rate = percent > 0 ? percent : 18;
  if (gross <= 0) return { subtotal: 0, cgst: 0, sgst: 0, rate, grand: 0 };
  const taxed = priceAndTax(gross, included, rate, "invoice");
  const cgst = taxed.taxLines.find((line) => /^cgst /i.test(line.description))?.amount ?? 0;
  const sgst = taxed.taxLines.find((line) => /^sgst /i.test(line.description))?.amount ?? 0;
  return {
    subtotal: taxed.price,
    cgst,
    sgst,
    rate,
    grand: included ? paise(gross) : paise(taxed.price + cgst + sgst),
  };
}

const TAX_ROW = /^(tax |cgst |sgst |igst )/i;

export function closedInvoiceView(raw: string | undefined, amount: number) {
  let stored: { description: string; amount: number }[] = [];
  try {
    const parsed = JSON.parse(raw || "[]") as { description?: string; amount?: number }[];
    if (Array.isArray(parsed)) {
      stored = parsed.filter((line) => line.description && Number.isInteger(line.amount)) as { description: string; amount: number }[];
    }
  } catch {
    stored = [];
  }
  const source = stored.length > 0 ? stored : [{ description: "Payment", amount }];
  const lines = source.filter((line) => !TAX_ROW.test(line.description));
  const goods = lines.length > 0 ? lines : [{ description: "Payment", amount }];
  const goodsSum = goods.reduce((sum, line) => sum + line.amount, 0);
  if (amount > goodsSum) {
    const added = gstOnRate(goodsSum, 18);
    return { lines: goods, tax: { subtotal: added.taxable, cgst: added.cgst, sgst: added.sgst, rate: 18, grand: added.total } };
  }
  return { lines: goods, tax: invoiceTotals(amount, true, 18) };
}

export function gstIncluded(total: number, rate = 18) {
  const half = (rate > 0 ? rate : 18) / 2;
  const cgst = paise((total * half) / (100 + (rate > 0 ? rate : 18)));
  const sgst = cgst;
  const tax = paise(cgst + sgst);
  const taxable = paise(total - tax);
  return { taxable, tax, cgst, sgst, igst: tax, total: paise(total) };
}

export function gstMode(sellerState: string, buyerState: string): "cgst" | "igst" {
  if (sellerState && buyerState && sellerState !== buyerState) return "igst";
  return "cgst";
}
