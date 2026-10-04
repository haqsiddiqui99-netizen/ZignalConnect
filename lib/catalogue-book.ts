import ExcelJS from "exceljs";

export type SheetRow = { line: number; cells: Record<string, string> };

const PLAN_HEADERS: Record<string, string> = {
  name: "name",
  "plan name": "name",
  speed: "speed",
  "speed mbps": "speed",
  price: "price",
  "monthly price": "price",
  data: "data",
  description: "description",
};

const CHARGE_HEADERS: Record<string, string> = {
  name: "name",
  "charge name": "name",
  type: "type",
  kind: "type",
  "charge type": "type",
  amount: "amount",
  tax: "tax",
  "tax percent": "tax",
  "tax percentage": "tax",
};

const DISCOUNT_HEADERS: Record<string, string> = {
  name: "name",
  "discount name": "name",
  applies: "applies",
  "applies to": "applies",
  frequency: "frequency",
  mode: "mode",
  basis: "mode",
  value: "value",
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && value.text != null) return String(value.text).trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

function headerKey(value: string) {
  return value.toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
}

export function readSheet(sheet: ExcelJS.Worksheet, headers: Record<string, string>, required: string[]): { rows: SheetRow[] } | { error: string } {
  const rows: { line: number; cells: string[] }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    const cells: string[] = [];
    for (let index = 1; index < values.length; index += 1) cells.push(cellText(values[index]));
    if (cells.some((cell) => cell.length > 0)) rows.push({ line: row.number, cells });
  });
  if (rows.length === 0) return { rows: [] as SheetRow[] };
  const index = new Map<string, number>();
  rows[0].cells.forEach((header, position) => {
    const key = headers[headerKey(header)];
    if (key && !index.has(key)) index.set(key, position);
  });
  for (const key of required) {
    if (!index.has(key)) return { error: `${sheet.name} needs a ${required.join(", ")} header.` };
  }
  return {
    rows: rows.slice(1).map((row) => {
      const cells: Record<string, string> = {};
      for (const [key, position] of index) cells[key] = row.cells[position] ?? "";
      return { line: row.line, cells };
    }),
  };
}

export function findSheet(workbook: ExcelJS.Workbook, name: string) {
  const wanted = name.toLowerCase();
  return workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === wanted);
}

export async function readCatalogueWorkbook(bytes: Buffer): Promise<
  | { ok: true; plans: SheetRow[]; charges: SheetRow[]; discounts: SheetRow[] }
  | { ok: false; error: string }
> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const plansSheet = findSheet(workbook, "Internet Plan");
  const chargesSheet = findSheet(workbook, "One-time charge");
  const discountsSheet = findSheet(workbook, "Promo & Discounts");
  if (!plansSheet && !chargesSheet && !discountsSheet) {
    return { ok: false as const, error: "The file needs the tabs Internet Plan, One-time charge, and Promo & Discounts." };
  }
  const plans = plansSheet ? readSheet(plansSheet, PLAN_HEADERS, ["name", "speed", "price", "description"]) : { rows: [] };
  const charges = chargesSheet ? readSheet(chargesSheet, CHARGE_HEADERS, ["name", "type", "amount"]) : { rows: [] };
  const discounts = discountsSheet ? readSheet(discountsSheet, DISCOUNT_HEADERS, ["name", "applies", "mode", "value"]) : { rows: [] };
  if ("error" in plans) return { ok: false as const, error: plans.error };
  if ("error" in charges) return { ok: false as const, error: charges.error };
  if ("error" in discounts) return { ok: false as const, error: discounts.error };
  return {
    ok: true as const,
    plans: plans.rows,
    charges: charges.rows,
    discounts: discounts.rows,
  };
}

export async function catalogueWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const plans = workbook.addWorksheet("Internet Plan");
  plans.addRow(["name", "speed", "price", "data", "description"]);
  plans.addRow(["Home 200", 200, 799, "Unlimited", "A mid-speed line for a small household."]);
  const charges = workbook.addWorksheet("One-time charge");
  charges.addRow(["name", "type", "amount", "tax"]);
  charges.addRow(["ONU router", "router", 1500, ""]);
  const discounts = workbook.addWorksheet("Promo & Discounts");
  discounts.addRow(["name", "applies", "frequency", "mode", "value"]);
  discounts.addRow(["Install waiver", "installation", "once", "amount", 500]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
