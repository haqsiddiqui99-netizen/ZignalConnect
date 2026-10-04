import ExcelJS from "exceljs";
import { BILL_CYCLES } from "@/lib/bill-cycle";
import { findSheet, readSheet, type SheetRow } from "@/lib/catalogue-book";

const ACCOUNT_HEADERS: Record<string, string> = {
  name: "name",
  email: "email",
  "portal email": "email",
  mobile: "mobile",
  phone: "mobile",
  address: "address",
  city: "city",
  "installation date": "installation",
  "installed on": "installation",
  "renewal date": "renewal",
  "renew date": "renewal",
  notes: "notes",
  note: "notes",
  area: "area",
  "bill cycle": "billCycle",
  reminders: "reminders",
  "payment reminders": "reminders",
  "payment reminder": "reminders",
  "tax on invoice": "invoiceTax",
  "invoice tax": "invoiceTax",
};

const PLAN_HEADERS: Record<string, string> = {
  email: "email",
  "portal email": "email",
  name: "name",
  "plan name": "name",
  "internet plan": "name",
  "internet plan name": "name",
  frequency: "frequency",
  "plan frequency": "frequency",
  "internet plan frequency": "frequency",
  amount: "amount",
  "plan amount": "amount",
  "internet plan amount": "amount",
  tax: "tax",
  "plan tax": "tax",
  "internet plan tax": "tax",
  "activation date": "activation",
  "renewal date": "renewal",
};

const CHARGE_HEADERS: Record<string, string> = {
  email: "email",
  "portal email": "email",
  name: "name",
  "charge name": "name",
  "one-time charge": "name",
  "one time charge": "name",
  amount: "amount",
  tax: "tax",
  "activation date": "activation",
};

const DISCOUNT_HEADERS: Record<string, string> = {
  email: "email",
  "portal email": "email",
  name: "name",
  "discount name": "name",
  promo: "name",
  "promo name": "name",
};

export async function readCustomerWorkbook(bytes: Buffer): Promise<
  | { ok: true; accounts: SheetRow[]; plans: SheetRow[]; charges: SheetRow[]; discounts: SheetRow[] }
  | { ok: false; error: string }
> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const accountSheet = findSheet(workbook, "Account");
  const planSheet = findSheet(workbook, "Internet plan");
  const chargeSheet = findSheet(workbook, "One-time charge");
  const discountSheet = findSheet(workbook, "Discount");
  if (!accountSheet && !planSheet && !chargeSheet && !discountSheet) {
    return { ok: false, error: "Download the template. The file needs Account, Internet plan, One-time charge, or Discount tabs." };
  }
  const accounts = accountSheet ? readSheet(accountSheet, ACCOUNT_HEADERS, ["name", "email", "mobile", "address", "city"]) : { rows: [] as SheetRow[] };
  const plans = planSheet ? readSheet(planSheet, PLAN_HEADERS, ["email", "name"]) : { rows: [] as SheetRow[] };
  const charges = chargeSheet ? readSheet(chargeSheet, CHARGE_HEADERS, ["email", "name"]) : { rows: [] as SheetRow[] };
  const discounts = discountSheet ? readSheet(discountSheet, DISCOUNT_HEADERS, ["email", "name"]) : { rows: [] as SheetRow[] };
  if ("error" in accounts) return { ok: false, error: accounts.error };
  if ("error" in plans) return { ok: false, error: plans.error };
  if ("error" in charges) return { ok: false, error: charges.error };
  if ("error" in discounts) return { ok: false, error: discounts.error };
  return { ok: true, accounts: accounts.rows, plans: plans.rows, charges: charges.rows, discounts: discounts.rows };
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
}

const DROPDOWN_ROWS = 1000;

function columnLetter(index: number) {
  let n = index;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function writeList(sheet: ExcelJS.Worksheet, column: number, values: string[]) {
  values.forEach((value, index) => {
    sheet.getCell(index + 1, column).value = value;
  });
  if (values.length === 0) return "";
  const letter = columnLetter(column);
  return `'Lists'!$${letter}$1:$${letter}$${values.length}`;
}

function dropdown(sheet: ExcelJS.Worksheet, column: number, formula: string) {
  if (!formula) return;
  const letter = columnLetter(column);
  const withLists = sheet as ExcelJS.Worksheet & {
    dataValidations: { add: (address: string, rule: ExcelJS.DataValidation) => void };
  };
  withLists.dataValidations.add(`${letter}2:${letter}${DROPDOWN_ROWS}`, {
    type: "list",
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Choose from the list",
    error: "Pick one of the values in the dropdown.",
  });
}

export async function customerWorkbook(catalogue: { plans: string[]; charges: string[]; discounts: string[] } = { plans: [], charges: [], discounts: [] }) {
  const workbook = new ExcelJS.Workbook();
  const cycles = BILL_CYCLES.map((cycle) => cycle.label);
  const reminders = ["Yes", "No"];
  const planName = catalogue.plans[0] ?? "";
  const chargeName = catalogue.charges[0] ?? "";
  const discountName = catalogue.discounts[0] ?? "";

  const account = workbook.addWorksheet("Account");
  const accountColumns = ["name", "email", "mobile", "address", "city", "installation date", "notes", "area", "bill cycle", "payment reminders", "Tax on invoice(%)"];
  account.addRow(accountColumns);
  account.addRow(["Arjun Mehta", "arjun.mehta@mail.com", "9820091104", "14, Pali Hill Road", "Mumbai", "2026-02-01", "ONT in the living room", "West", "Monthly", "Yes", ""]);
  styleSheet(account);

  const plans = workbook.addWorksheet("Internet plan");
  const planColumns = ["email", "Internet Plan name", "Internet Plan Frequency", "Internet Plan amount", "Internet Plan Tax", "Activation date"];
  plans.addRow(planColumns);
  plans.addRow(["arjun.mehta@mail.com", planName, "Monthly", "", "", "2026-02-01"]);
  styleSheet(plans);

  const charges = workbook.addWorksheet("One-time charge");
  const chargeColumns = ["email", "Charge name", "Amount", "Tax", "Activation date"];
  charges.addRow(chargeColumns);
  if (chargeName) charges.addRow(["arjun.mehta@mail.com", chargeName, "", "", "2026-02-01"]);
  styleSheet(charges);

  const discounts = workbook.addWorksheet("Discount");
  const discountColumns = ["email", "Discount name"];
  discounts.addRow(discountColumns);
  if (discountName) discounts.addRow(["arjun.mehta@mail.com", discountName]);
  styleSheet(discounts);

  const lists = workbook.addWorksheet("Lists", { state: "veryHidden" });
  const cycleList = writeList(lists, 1, cycles);
  const reminderList = writeList(lists, 2, reminders);
  const planList = writeList(lists, 3, catalogue.plans);
  const chargeList = writeList(lists, 4, catalogue.charges);
  const discountList = writeList(lists, 5, catalogue.discounts);

  dropdown(account, accountColumns.indexOf("bill cycle") + 1, cycleList);
  dropdown(account, accountColumns.indexOf("payment reminders") + 1, reminderList);
  dropdown(plans, planColumns.indexOf("Internet Plan name") + 1, planList);
  dropdown(plans, planColumns.indexOf("Internet Plan Frequency") + 1, cycleList);
  dropdown(charges, chargeColumns.indexOf("Charge name") + 1, chargeList);
  dropdown(discounts, discountColumns.indexOf("Discount name") + 1, discountList);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
