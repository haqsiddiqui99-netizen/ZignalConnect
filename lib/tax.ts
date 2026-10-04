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

export function gstOnTop(taxable: number) {
  const cgst = Math.round((taxable * 9) / 100);
  const sgst = Math.round((taxable * 9) / 100);
  const tax = cgst + sgst;
  return { taxable, tax, cgst, sgst, igst: tax, total: taxable + tax };
}

export function addGstLines(base: number, label: string) {
  if (base <= 0) return [] as { description: string; amount: number }[];
  const parts = gstOnTop(base);
  return [
    { description: `CGST 9% on ${label}`, amount: parts.cgst },
    { description: `SGST 9% on ${label}`, amount: parts.sgst },
  ];
}

export function gstIncluded(total: number) {
  const taxable = Math.round((total * 100) / 118);
  const tax = total - taxable;
  const cgst = Math.floor(tax / 2);
  const sgst = tax - cgst;
  return { taxable, tax, cgst, sgst, igst: tax, total };
}

export function gstMode(sellerState: string, buyerState: string): "cgst" | "igst" {
  if (sellerState && buyerState && sellerState !== buyerState) return "igst";
  return "cgst";
}
