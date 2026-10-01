import { isDate } from "@/lib/format";

export const CSV_TEMPLATE = `name,email,mobile,address,city,plan,renewal date,installation date,status,notes,area
Arjun Mehta,arjun.mehta@mail.com,9820091104,"14, Pali Hill Road",Mumbai,Home 300,2026-11-01,2026-02-01,active,ONT in the living room,West
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
  status: "active" | "suspended";
  notes: string;
  area: string;
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

export function parseCustomerCsv(text: string): { rows: ImportRow[]; error?: string } {
  const table = parseTable(text);
  if (table.length < 2) return { rows: [], error: "The file needs a header row and at least one customer." };
  const headers = table[0].map((header) => header.toLowerCase());
  const index = new Map<keyof Omit<ImportRow, "line">, number>();
  headers.forEach((header, position) => {
    const key = HEADER_MAP[header];
    if (key && !index.has(key)) index.set(key, position);
  });
  for (const required of ["name", "email", "mobile", "address", "city", "plan", "renewDate"] as const) {
    if (!index.has(required)) {
      return { rows: [], error: "The header must include name, email, mobile, address, city, plan, and renewal date." };
    }
  }

  const rows = table.slice(1).map((cells, offset) => {
    const pick = (key: keyof Omit<ImportRow, "line">) => {
      const position = index.get(key);
      return position === undefined ? "" : (cells[position] ?? "");
    };
    const statusText = pick("status").toLowerCase();
    const status: ImportRow["status"] = statusText === "paused" || statusText === "suspended" ? "suspended" : "active";
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
    };
  });
  return { rows };
}
