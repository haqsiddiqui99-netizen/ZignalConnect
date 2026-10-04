import { isDate } from "@/lib/format";
import { lineStatusFromImport, type LineStatus } from "@/lib/line-status";

export const CSV_TEMPLATE = `name,email,mobile,address,city,Internet Plan name,Internet Plan Frequency,Internet Plan amount,Internet Plan Tax,installation date,renewal date,notes,area,bill cycle,payment reminders,router amount,router tax,installation amount,installation tax,service amount,service tax,other charge amount,other charge tax,Tax on invoice(%),discount name,discount applies,discount mode (amount or %age),discount value
Arjun Mehta,arjun.mehta@mail.com,9820091104,"14, Pali Hill Road",Mumbai,Home 300,monthly,,,2026-02-01,2026-11-01,ONT in the living room,West,monthly,yes,,,,,,,,,,,,,
`;

export const PLAN_CSV_TEMPLATE = `name,speed,price,data,description
Home 200,200,799,Unlimited,A mid-speed line for a small household.
`;

export type ImportRow = {
  line: number;
  name: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  plan: string;
  renewDate: string;
  installationDate: string;
  status: LineStatus;
  notes: string;
  area: string;
  billCycle: string;
  reminders: string;
  planCycle: string;
  planAmount: string;
  routerAmount: string;
  routerFrequency: string;
  routerTax: string;
  installationAmount: string;
  installationFrequency: string;
  installationTax: string;
  serviceAmount: string;
  serviceFrequency: string;
  serviceTax: string;
  otherCharge: string;
  otherAmount: string;
  otherFrequency: string;
  otherTax: string;
  planFrequency: string;
  planTax: string;
  invoiceTax: string;
  discountName: string;
  discountApplies: string;
  discountMode: string;
  discountValue: string;
};

const HEADER_MAP: Record<string, keyof Omit<ImportRow, "line">> = {
  name: "name",
  email: "email",
  mobile: "mobile",
  phone: "mobile",
  address: "address",
  city: "city",
  plan: "plan",
  "plan name": "plan",
  "internet plan": "plan",
  "internet plan name": "plan",
  "inernet plan name": "plan",
  "renewal date": "renewDate",
  "renew date": "renewDate",
  renew_date: "renewDate",
  "installation date": "installationDate",
  "installed on": "installationDate",
  installation_date: "installationDate",
  status: "status",
  notes: "notes",
  note: "notes",
  area: "area",
  branch: "area",
  "bill cycle": "billCycle",
  bill_cycle: "billCycle",
  cycle: "billCycle",
  reminders: "reminders",
  reminder: "reminders",
  "payment reminders": "reminders",
  "payment reminder": "reminders",
  "router amount": "routerAmount",
  router_amount: "routerAmount",
  "router frequency": "routerFrequency",
  router_frequency: "routerFrequency",
  "router tax": "routerTax",
  router_tax: "routerTax",
  "installation amount": "installationAmount",
  installation_amount: "installationAmount",
  "installation frequency": "installationFrequency",
  installation_frequency: "installationFrequency",
  "installation tax": "installationTax",
  installation_tax: "installationTax",
  "service amount": "serviceAmount",
  service_amount: "serviceAmount",
  "service frequency": "serviceFrequency",
  service_frequency: "serviceFrequency",
  "service tax": "serviceTax",
  service_tax: "serviceTax",
  "other charge": "otherCharge",
  other_charge: "otherCharge",
  "other amount": "otherAmount",
  other_amount: "otherAmount",
  "other charge amount": "otherAmount",
  "other frequency": "otherFrequency",
  other_frequency: "otherFrequency",
  "other tax": "otherTax",
  other_tax: "otherTax",
  "other charge tax": "otherTax",
  "plan frequency": "planFrequency",
  plan_frequency: "planFrequency",
  "internet plan frequency": "planCycle",
  "plan amount": "planAmount",
  "internet plan amount": "planAmount",
  "plan tax": "planTax",
  plan_tax: "planTax",
  "internet plan tax": "planTax",
  "invoice tax": "invoiceTax",
  invoice_tax: "invoiceTax",
  "tax on invoice": "invoiceTax",
  "discount name": "discountName",
  discount_name: "discountName",
  "discount applies": "discountApplies",
  discount_applies: "discountApplies",
  "discount mode": "discountMode",
  discount_mode: "discountMode",
  "discount value": "discountValue",
  discount_value: "discountValue",
};

function parseTable(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((part) => part.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((part) => part.length > 0)) rows.push(row);
  }
  return rows;
}

export function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (isDate(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isDate(iso) ? iso : null;
}

export type PlanImportRow = {
  line: number;
  name: string;
  speed: string;
  price: string;
  data: string;
  description: string;
};

const PLAN_HEADER_MAP: Record<string, keyof Omit<PlanImportRow, "line">> = {
  name: "name",
  "plan name": "name",
  plan: "name",
  speed: "speed",
  "speed mbps": "speed",
  speed_mbps: "speed",
  mbps: "speed",
  price: "price",
  "monthly price": "price",
  amount: "price",
  data: "data",
  "data cap": "data",
  data_cap: "data",
  description: "description",
};

export function wholeUnits(value: string) {
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/mbps|rs\.?|inr/gi, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return amount > 0 ? amount : null;
}

export function parsePlanCsv(text: string): { rows: PlanImportRow[]; error?: string } {
  const table = parseTable(text);
  if (table.length < 2) return { rows: [], error: "The file needs a header row and at least one plan." };
  const headers = table[0].map((header) => header.toLowerCase().replace(/\(.*?\)/g, "").trim());
  const index = new Map<keyof Omit<PlanImportRow, "line">, number>();
  headers.forEach((header, position) => {
    const key = PLAN_HEADER_MAP[header];
    if (key && !index.has(key)) index.set(key, position);
  });
  for (const required of ["name", "speed", "price", "description"] as const) {
    if (!index.has(required)) {
      return { rows: [], error: "The header must include name, speed, price, and description." };
    }
  }
  const rows = table.slice(1).map((cells, offset) => {
    const pick = (key: keyof Omit<PlanImportRow, "line">) => {
      const position = index.get(key);
      return position === undefined ? "" : (cells[position] ?? "");
    };
    return {
      line: offset + 2,
      name: pick("name"),
      speed: pick("speed"),
      price: pick("price"),
      data: pick("data"),
      description: pick("description"),
    };
  });
  return { rows };
}

export function parseCustomerCsv(text: string): { rows: ImportRow[]; error?: string } {
  const table = parseTable(text);
  if (table.length < 2) return { rows: [], error: "The file needs a header row and at least one customer." };
  const headers = table[0].map((header) => header.toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim());
  const index = new Map<keyof Omit<ImportRow, "line">, number>();
  headers.forEach((header, position) => {
    const key = HEADER_MAP[header];
    if (key && !index.has(key)) index.set(key, position);
  });
  for (const required of ["name", "email", "mobile", "address", "city", "plan", "renewDate"] as const) {
    if (!index.has(required)) {
      return { rows: [], error: "The header must include name, email, mobile, address, city, Internet Plan name, and renewal date." };
    }
  }

  const rows = table.slice(1).map((cells, offset) => {
    const pick = (key: keyof Omit<ImportRow, "line">) => {
      const position = index.get(key);
      return position === undefined ? "" : (cells[position] ?? "");
    };
    const status = lineStatusFromImport(pick("status"));
    return {
      line: offset + 2,
      name: pick("name"),
      email: pick("email").toLowerCase(),
      mobile: pick("mobile").replace(/\s+/g, ""),
      address: pick("address"),
      city: pick("city"),
      plan: pick("plan"),
      renewDate: pick("renewDate"),
      installationDate: pick("installationDate"),
      status,
      notes: pick("notes"),
      area: pick("area"),
      billCycle: pick("billCycle"),
      reminders: pick("reminders"),
      planCycle: pick("planCycle"),
      planAmount: pick("planAmount"),
      routerAmount: pick("routerAmount"),
      routerFrequency: pick("routerFrequency"),
      routerTax: pick("routerTax"),
      installationAmount: pick("installationAmount"),
      installationFrequency: pick("installationFrequency"),
      installationTax: pick("installationTax"),
      serviceAmount: pick("serviceAmount"),
      serviceFrequency: pick("serviceFrequency"),
      serviceTax: pick("serviceTax"),
      otherCharge: pick("otherCharge"),
      otherAmount: pick("otherAmount"),
      otherFrequency: pick("otherFrequency"),
      otherTax: pick("otherTax"),
      planFrequency: pick("planFrequency"),
      planTax: pick("planTax"),
      invoiceTax: pick("invoiceTax"),
      discountName: pick("discountName"),
      discountApplies: pick("discountApplies"),
      discountMode: pick("discountMode"),
      discountValue: pick("discountValue"),
    };
  });
  return { rows };
}
