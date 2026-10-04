import ExcelJS from "exceljs";
import { findSheet, readSheet, type SheetRow } from "@/lib/catalogue-book";

const HEADERS: Record<string, string> = {
  email: "email",
  "portal email": "email",
  mobile: "mobile",
  phone: "mobile",
  name: "name",
  "subscriber name": "name",
  amount: "amount",
  "payment amount": "amount",
  date: "date",
  "payment date": "date",
  "paid on": "date",
  source: "source",
  method: "source",
  "payment source": "source",
  "transaction id": "transactionId",
  transactionid: "transactionId",
  reference: "transactionId",
  "txn id": "transactionId",
  utr: "transactionId",
};

export const PAYMENT_SOURCES = ["UPI", "Cash", "Internet"] as const;

export function paymentSource(value: string): "UPI" | "Cash" | "Internet" | "Card" | "Net banking" | "invalid" {
  const key = value.trim().toLowerCase();
  if (key === "upi") return "UPI";
  if (key === "cash") return "Cash";
  if (key === "internet") return "Internet";
  if (key === "card") return "Card";
  if (key === "net banking" || key === "netbanking") return "Net banking";
  return "invalid";
}

export async function readPaymentWorkbook(bytes: Buffer): Promise<{ ok: true; rows: SheetRow[] } | { ok: false; error: string }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = findSheet(workbook, "Payments") ?? findSheet(workbook, "Payment");
  if (!sheet) return { ok: false, error: "Download the template. The file needs a Payments tab." };
  const parsed = readSheet(sheet, HEADERS, ["email", "amount", "date", "source"]);
  if ("error" in parsed) {
    return { ok: false, error: "Download the template. The Payments tab needs email, payment amount, date, and source columns." };
  }
  return { ok: true, rows: parsed.rows };
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

export async function paymentWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payments");
  const columns = ["email", "mobile", "name", "payment amount", "date", "source", "transaction id"];
  sheet.addRow(columns);
  sheet.addRow(["name@mail.com", "9820091104", "Subscriber name", 999, "2026-10-01", "UPI", "TXN1001"]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => {
    column.width = 24;
  });

  const lists = workbook.addWorksheet("Lists", { state: "veryHidden" });
  PAYMENT_SOURCES.forEach((source, index) => {
    lists.getCell(index + 1, 1).value = source;
  });
  const sourceColumn = columns.indexOf("source") + 1;
  const letter = columnLetter(sourceColumn);
  const withLists = sheet as ExcelJS.Worksheet & {
    dataValidations: { add: (address: string, rule: ExcelJS.DataValidation) => void };
  };
  withLists.dataValidations.add(`${letter}2:${letter}${DROPDOWN_ROWS}`, {
    type: "list",
    allowBlank: true,
    formulae: [`'Lists'!$A$1:$A$${PAYMENT_SOURCES.length}`],
    showErrorMessage: true,
    errorStyle: "error",
    errorTitle: "Choose from the list",
    error: "Pick UPI, Cash, or Internet.",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
