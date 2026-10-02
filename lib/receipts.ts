import { many, one, run } from "@/lib/db";
import { CATALOG, isProductPlan } from "@/lib/entitlements";
import { formatDate, formatStamp, nowStamp, todayISO } from "@/lib/format";
import { getPlatformProfile, getProvider, getUsage, trialStatus } from "@/lib/queries";
import { gstIncluded, gstMode, gstOnTop } from "@/lib/tax";
import type { ReceiptDoc } from "@/components/receipt-sheet";

export type DeskCharge = {
  id: number;
  provider_id: number;
  provider_name: string;
  period: string;
  plan_label: string;
  total: number;
  paid_at: string;
  method: string;
  reference: string;
};

type Party = {
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  gstin: string;
  email?: string;
};

function partyLines(party: Party) {
  const place = [party.city, party.state].filter(Boolean).join(", ");
  const lines = [party.address, place, party.phone, party.email ?? ""].filter(Boolean);
  lines.push(party.gstin ? `GSTIN ${party.gstin}` : "GSTIN not registered");
  return lines;
}

function logoMark(letter: string, name: string) {
  const mark = letter.trim().slice(0, 2).toUpperCase();
  return mark || name.trim().slice(0, 1).toUpperCase() || "Z";
}

function receiptNumber(prefix: "SR" | "DR", id: number) {
  return `${prefix}-${String(id).padStart(5, "0")}`;
}

function monthYear(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

type IncomeRow = {
  id: number;
  amount: number;
  method: string;
  reference: string;
  paid_at: string;
  period_start: string;
  period_end: string;
  note: string;
  kind: string;
  receipt_snapshot: string;
  user_id: number;
  customer_name: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  plan_name: string;
  provider_id: number;
  isp_name: string;
  gstin: string;
  isp_address: string;
  isp_city: string;
  isp_state: string;
  support_phone: string;
  logo_letter: string;
};

function buildIncome(row: IncomeRow): ReceiptDoc {
  const taxed = Boolean(row.gstin);
  const money = taxed ? gstIncluded(row.amount) : { taxable: row.amount, cgst: 0, sgst: 0, igst: 0, total: row.amount };
  const seller: Party = {
    name: row.isp_name,
    address: row.isp_address,
    city: row.isp_city,
    state: row.isp_state,
    phone: row.support_phone,
    gstin: row.gstin,
  };
  const partial = row.kind === "partial" ? "Partial payment toward " : "";
  return {
    title: "Payment receipt",
    status: "Paid",
    number: receiptNumber("SR", row.id),
    when: formatStamp(row.paid_at),
    logo: logoMark(row.logo_letter, row.isp_name),
    showLogo: true,
    sellerName: seller.name,
    sellerLines: partyLines(seller),
    buyerName: row.customer_name,
    buyerLines: [row.address, row.city, row.mobile, row.email].filter(Boolean),
    place: row.isp_state || row.isp_city || row.city || "Not set",
    lines: [
      {
        description: `${partial}${row.plan_name}, ${formatDate(row.period_start)} to ${formatDate(row.period_end)}`,
        sac: "998422",
        amount: money.taxable,
      },
    ],
    taxable: money.taxable,
    cgst: taxed ? money.cgst : 0,
    sgst: taxed ? money.sgst : 0,
    igst: 0,
    total: row.amount,
    gstMode: taxed ? "cgst" : "none",
    method: row.method,
    reference: row.reference,
    period: `${formatDate(row.period_start)} to ${formatDate(row.period_end)}`,
    note: row.note,
  };
}

export function incomeDocument(paymentId: number, viewer: { role: "admin" | "customer"; providerId: number; uid: number }) {
  const row = one<IncomeRow>(
    `SELECT pay.id, pay.amount, pay.method, pay.reference, pay.paid_at, pay.period_start, pay.period_end,
            pay.note, pay.kind, pay.receipt_snapshot, u.id AS user_id, u.name AS customer_name, u.email,
            c.mobile, c.address, c.city, p.name AS plan_name, pr.id AS provider_id, pr.name AS isp_name,
            pr.gstin, pr.address AS isp_address, pr.city AS isp_city, pr.state AS isp_state,
            pr.support_phone, pr.logo_letter
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     JOIN plans p ON p.id = c.plan_id
     JOIN providers pr ON pr.id = u.provider_id
     WHERE pay.id = ?`,
    paymentId,
  );
  if (!row) return null;
  const allowed = viewer.role === "admin" ? viewer.providerId === row.provider_id : viewer.uid === row.user_id;
  if (!allowed) return null;
  if (row.receipt_snapshot) {
    try {
      const saved = JSON.parse(row.receipt_snapshot) as ReceiptDoc;
      saved.showLogo = true;
      saved.logo = saved.logo || logoMark(row.logo_letter, row.isp_name);
      return saved;
    } catch {
      /* rebuild a damaged snapshot */
    }
  }
  const doc = buildIncome(row);
  run("UPDATE payments SET receipt_snapshot = ? WHERE id = ?", JSON.stringify(doc), row.id);
  return doc;
}

type DeskRow = {
  id: number;
  provider_id: number;
  period: string;
  plan_label: string;
  plan_amount: number;
  overage_amount: number;
  taxable: number;
  tax: number;
  total: number;
  gst_mode: "none" | "cgst" | "igst";
  seller_name: string;
  seller_gstin: string;
  seller_address: string;
  seller_city: string;
  seller_state: string;
  seller_phone: string;
  seller_email: string;
  buyer_name: string;
  buyer_gstin: string;
  buyer_address: string;
  buyer_city: string;
  buyer_state: string;
  buyer_phone: string;
  method: string;
  reference: string;
  paid_at: string;
  issued_at: string;
};

function buildDesk(row: DeskRow): ReceiptDoc {
  const paid = Boolean(row.paid_at);
  const month = monthYear(row.period);
  const lines = [{ description: `${row.plan_label} desk for ${month}`, sac: "998315", amount: row.plan_amount }];
  if (row.overage_amount > 0) {
    lines.push({ description: `Subscriber overflow for ${month}`, sac: "998315", amount: row.overage_amount });
  }
  const cgst = row.gst_mode === "cgst" ? Math.floor(row.tax / 2) : 0;
  return {
    title: paid ? "Payment receipt" : "Tax invoice",
    status: paid ? "Paid" : "Not collected",
    number: receiptNumber("DR", row.id),
    when: formatStamp(paid ? row.paid_at : row.issued_at),
    logo: "Z",
    showLogo: true,
    sellerName: row.seller_name,
    sellerLines: partyLines({
      name: row.seller_name,
      address: row.seller_address,
      city: row.seller_city,
      state: row.seller_state,
      phone: row.seller_phone,
      gstin: row.seller_gstin,
      email: row.seller_email,
    }),
    buyerName: row.buyer_name,
    buyerLines: partyLines({
      name: row.buyer_name,
      address: row.buyer_address,
      city: row.buyer_city,
      state: row.buyer_state,
      phone: row.buyer_phone,
      gstin: row.buyer_gstin,
    }),
    place: row.buyer_state || row.seller_state || "Not set",
    lines,
    taxable: row.taxable,
    cgst,
    sgst: row.gst_mode === "cgst" ? row.tax - cgst : 0,
    igst: row.gst_mode === "igst" ? row.tax : 0,
    total: row.total,
    gstMode: row.gst_mode,
    method: row.method,
    reference: row.reference,
    period: month,
    note: paid ? "" : "The monthly desk fee is on this ledger. A card charge is not connected.",
  };
}

export function deskDocument(id: number, viewer: { kind: "operator" } | { kind: "desk"; role: "admin"; providerId: number }) {
  const row = one<DeskRow>("SELECT * FROM desk_payments WHERE id = ?", id);
  if (!row) return null;
  if (viewer.kind === "desk" && viewer.providerId !== row.provider_id) return null;
  return buildDesk(row);
}

export function listDeskCharges(providerId?: number) {
  return many<DeskCharge>(
    `SELECT d.id, d.provider_id, pr.name AS provider_name, d.period, d.plan_label, d.total, d.paid_at, d.method, d.reference
     FROM desk_payments d
     JOIN providers pr ON pr.id = d.provider_id
     ${providerId ? "WHERE d.provider_id = ?" : ""}
     ORDER BY d.period DESC, pr.name`,
    ...(providerId ? [providerId] : []),
  );
}

export function ensureDeskCharge(providerId: number) {
  const provider = getProvider(providerId);
  if (!provider) return;
  if (trialStatus(provider.trial_ends).active) return;
  const period = todayISO().slice(0, 7);
  const existing = one<{ id: number; paid_at: string }>(
    "SELECT id, paid_at FROM desk_payments WHERE provider_id = ? AND period = ?",
    providerId,
    period,
  );
  if (existing?.paid_at) return;

  const plan = provider.product_plan && isProductPlan(provider.product_plan) ? provider.product_plan : "pro";
  const catalog = CATALOG[plan];
  const usage = getUsage(providerId);
  const planAmount = catalog.price;
  const overageAmount = usage.overageDue;
  const taxable = planAmount + overageAmount;
  const seller = getPlatformProfile();
  const charged = seller.gstin ? gstOnTop(taxable) : { tax: 0, total: taxable };
  const mode = seller.gstin ? gstMode(seller.state, provider.state) : "none";
  const values = [
    catalog.label,
    planAmount,
    overageAmount,
    taxable,
    charged.tax,
    charged.total,
    mode,
    seller.legal_name,
    seller.gstin,
    seller.address,
    seller.city,
    seller.state,
    seller.phone,
    seller.email,
    provider.name,
    provider.gstin,
    provider.address,
    provider.city,
    provider.state,
    provider.support_phone,
  ];
  if (existing) {
    run(
      `UPDATE desk_payments SET
        plan_label = ?, plan_amount = ?, overage_amount = ?, taxable = ?, tax = ?, total = ?, gst_mode = ?,
        seller_name = ?, seller_gstin = ?, seller_address = ?, seller_city = ?, seller_state = ?, seller_phone = ?, seller_email = ?,
        buyer_name = ?, buyer_gstin = ?, buyer_address = ?, buyer_city = ?, buyer_state = ?, buyer_phone = ?
       WHERE id = ? AND paid_at = ''`,
      ...values,
      existing.id,
    );
    return;
  }
  try {
  run(
    `INSERT INTO desk_payments (
      provider_id, period, plan_label, plan_amount, overage_amount, taxable, tax, total, gst_mode,
      seller_name, seller_gstin, seller_address, seller_city, seller_state, seller_phone, seller_email,
      buyer_name, buyer_gstin, buyer_address, buyer_city, buyer_state, buyer_phone, issued_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    providerId,
    period,
    catalog.label,
    planAmount,
    overageAmount,
    taxable,
    charged.tax,
    charged.total,
    mode,
    seller.legal_name,
    seller.gstin,
    seller.address,
    seller.city,
    seller.state,
    seller.phone,
    seller.email,
    provider.name,
    provider.gstin,
    provider.address,
    provider.city,
    provider.state,
    provider.support_phone,
    nowStamp(),
  );
  } catch {
    /* another request issued this month first */
  }
}

export function ensureDeskCharges(providerId?: number) {
  if (providerId) {
    ensureDeskCharge(providerId);
    return;
  }
  const providers = many<{ id: number }>("SELECT id FROM providers");
  for (const provider of providers) ensureDeskCharge(provider.id);
}
