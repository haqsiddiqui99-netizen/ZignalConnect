import { many, one, run } from "@/lib/db";
import type { SupportFollowup, SupportRequest } from "@/lib/support";
import { CATALOG, OVERAGE_RATE, STAFF_OVERAGE_RATE, customerLimit, isBillTerm, isProductPlan, overflowLimit, staffLimit, termQuote, type ProductPlan } from "@/lib/entitlements";
import { isLineStatus, type LineStatus } from "@/lib/line-status";
import type { BillCycle } from "@/lib/bill-cycle";
import { addDays, addMonths, daysUntil, formatDate, monthBounds, monthLabel, todayISO } from "@/lib/format";

export type Plan = {
  id: number;
  name: string;
  speed_mbps: number;
  price: number;
  data_cap: string;
  description: string;
  subscribers: number;
};

export type Subscriber = {
  id: number;
  user_id: number;
  name: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  pincode: string;
  state: string;
  country: string;
  area: string;
  status: LineStatus;
  plan_id: number;
  plan_label: string;
  plan_name: string;
  speed_mbps: number;
  price: number;
  data_cap: string;
  plan_description: string;
  renew_date: string;
  installation_date: string;
  notes: string;
  bill_cycle: BillCycle;
  plan_amount: number;
  plan_cycle: string;
  reminders: number;
  plan_frequency: "once" | "recurring";
  plan_tax_included: number;
  plan_tax_percent: number;
  plan_billed: number;
  invoice_tax_included: number;
  invoice_tax_percent: number;
  password_via: "email" | "whatsapp" | "sms";
  line_name: string;
  account_category: string;
  disconnect_unpaid: number;
};

export const ACCOUNT_CATEGORIES = [
  "Residential",
  "Corporate",
  "Hospital",
  "Bank",
  "Post Office",
  "School/College",
  "Government",
  "Others",
] as const;

export function isAccountCategory(value: string): value is (typeof ACCOUNT_CATEGORIES)[number] {
  return (ACCOUNT_CATEGORIES as readonly string[]).includes(value);
}

export function accountCategoryFromImport(value: string): (typeof ACCOUNT_CATEGORIES)[number] | "invalid" {
  const text = value.trim().toLowerCase();
  if (!text) return "Residential";
  return ACCOUNT_CATEGORIES.find((item) => item.toLowerCase() === text) ?? "invalid";
}

const CREDIT_LABELS = [
  "",
  "1 — Always overdue",
  "2 — Often pays late",
  "3 — Sometimes a few days late",
  "4 — Always pays on the due date",
  "5 — Always pays on time",
];

export function subscriberCredit(subscriber?: { id: number; installation_date: string; renew_date: string }) {
  if (!subscriber?.installation_date) return { value: "", placeholder: "Not rated yet" };
  const today = todayISO();
  const unlock = addMonths(subscriber.installation_date, 1);
  if (today < unlock) return { value: "", placeholder: `Not rated until ${formatDate(unlock)}` };
  const payments = many<{ paid_at: string; period_start: string }>(
    "SELECT paid_at, period_start FROM payments WHERE customer_id = ? AND kind = 'full' AND period_start <> '' ORDER BY paid_at DESC LIMIT 6",
    subscriber.id,
  );
  const late = payments.map((payment) => daysUntil(payment.paid_at.slice(0, 10)) - daysUntil(payment.period_start.slice(0, 10)));
  if (subscriber.renew_date && subscriber.renew_date < today) late.push(-daysUntil(subscriber.renew_date));
  if (late.length === 0) return { value: "", placeholder: "Not rated until the first payment" };
  const worst = Math.max(...late);
  const score = worst > 30 ? 1 : worst > 7 ? 2 : worst > 0 ? 3 : worst === 0 ? 4 : 5;
  return { value: CREDIT_LABELS[score], placeholder: "" };
}

export type Payment = {
  id: number;
  customer_id: number;
  customer_name: string;
  amount: number;
  method: string;
  reference: string;
  paid_at: string;
  period_start: string;
  period_end: string;
  note: string;
  kind: "full" | "partial";
};

export type Reminder = {
  id: number;
  customer_id: number;
  title: string;
  body: string;
  created_at: string;
  channel: string;
  stage: string;
  cycle_date: string;
};

export type Complaint = {
  id: number;
  customer_id: number;
  customer_name: string;
  category: string;
  details: string;
  status: "open" | "in_progress" | "closed" | "cancelled" | "duplicate";
  provider_note: string;
  created_at: string;
  updated_at: string;
  assignee_id: number | null;
  assignee_name: string;
  resolved_at: string;
  sla_hours: number;
};

export type StaffMember = {
  id: number;
  name: string;
  email: string;
  mobile: string;
  login_password: string;
  is_owner: number;
};

export type ProviderRecord = {
  id: number;
  name: string;
  product_plan: ProductPlan;
  support_phone: string;
  logo_letter: string;
  created_at: string;
  subscriber_base: number;
  trial_ends: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  pay_method: string;
  pay_via: string;
  pay_holder: string;
  pay_detail: string;
  pay_expiry: string;
  reminder_soon_title: string;
  reminder_soon_body: string;
  reminder_due_title: string;
  reminder_due_body: string;
  billing_term: string;
  line_kind: string;
  line_host: string;
  line_port: number;
  line_user: string;
  line_secret: string;
  line_db: string;
  line_coa: string;
};

const subscriberSelect = `
  SELECT
    c.id, c.user_id, u.name, u.email, c.mobile, c.address, c.city, c.pincode, c.state, c.country, c.area, c.status,
    c.plan_id, c.plan_label, CASE WHEN c.plan_label <> '' THEN c.plan_label ELSE p.name END AS plan_name, p.speed_mbps, p.price, p.data_cap,
    p.description AS plan_description, c.renew_date, c.installation_date, c.notes,
    c.bill_cycle, c.plan_amount, c.plan_cycle, c.reminders, c.plan_frequency, c.plan_tax_included, c.plan_tax_percent,
    c.plan_billed, c.invoice_tax_included, c.invoice_tax_percent, c.password_via, c.line_name,
    c.account_category, c.disconnect_unpaid
  FROM customers c
  JOIN users u ON u.id = c.user_id
  JOIN plans p ON p.id = c.plan_id
`;

export type CustomerCharge = {
  id: number;
  customer_id: number;
  kind: string;
  label: string;
  frequency: "once" | "recurring";
  bill_cycle: string;
  amount: number;
  billed: number;
  tax_included: number;
  tax_percent: number;
  activated_on: string;
};

export function listCustomerCharges(customerId: number) {
  return many<CustomerCharge>(
    "SELECT id, customer_id, kind, label, frequency, bill_cycle, amount, billed, tax_included, tax_percent, activated_on FROM customer_charges WHERE customer_id = ? ORDER BY id",
    customerId,
  );
}

export type CustomerDiscount = {
  id: number;
  customer_id: number;
  name: string;
  applies_to: string;
  mode: "amount" | "percent";
  frequency: "once" | "recurring";
  billed: number;
  value: number;
};

export function listCustomerDiscounts(customerId: number) {
  return many<CustomerDiscount>(
    "SELECT id, customer_id, name, applies_to, mode, frequency, billed, value FROM customer_discounts WHERE customer_id = ? ORDER BY id",
    customerId,
  );
}

export type CustomerExtraPlan = {
  id: number;
  customer_id: number;
  plan_id: number;
  label: string;
  plan_name: string;
  price: number;
  bill_cycle: string;
  amount: number;
  tax_included: number;
  tax_percent: number;
  activated_on: string;
  renews_on: string;
};

export function listCustomerExtraPlans(customerId: number) {
  return many<CustomerExtraPlan>(
    `SELECT e.id, e.customer_id, e.plan_id, e.label, CASE WHEN e.label <> '' THEN e.label ELSE p.name END AS plan_name, p.price, e.bill_cycle, e.amount, e.tax_included, e.tax_percent, e.activated_on, e.renews_on
     FROM customer_extra_plans e
     JOIN plans p ON p.id = e.plan_id
     WHERE e.customer_id = ?
     ORDER BY e.id`,
    customerId,
  );
}

export function getProvider(providerId: number) {
  return one<ProviderRecord>("SELECT * FROM providers WHERE id = ?", providerId);
}

export function trialStatus(trialEnds: string) {
  if (!trialEnds) return { active: false, ended: false, ends: "", daysLeft: 0 };
  const daysLeft = daysUntil(trialEnds);
  if (daysLeft < 0) return { active: false, ended: true, ends: trialEnds, daysLeft: 0 };
  return { active: true, ended: false, ends: trialEnds, daysLeft };
}

export function getUsage(providerId: number) {
  const provider = getProvider(providerId);
  const plan = provider?.product_plan && isProductPlan(provider.product_plan) ? provider.product_plan : "pro";
  const customers = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM customers c JOIN users u ON u.id = c.user_id WHERE u.provider_id = ?",
    providerId,
  );
  const staff = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE provider_id = ? AND role = 'admin'",
    providerId,
  );
  const customerCap = customerLimit(plan);
  const hardCap = overflowLimit(plan);
  const staffCap = staffLimit(plan);
  const customerCount = customers?.n ?? 0;
  const staffCount = staff?.n ?? 0;
  const overage = Math.max(0, customerCount - customerCap);
  const staffOverage = Number.isFinite(staffCap) ? Math.max(0, staffCount - staffCap) : 0;
  return {
    provider,
    plan,
    customers: customerCount,
    staff: staffCount,
    customerCap,
    overflowCap: hardCap,
    overage,
    overageDue: overage * OVERAGE_RATE,
    staffOverage,
    staffOverageDue: staffOverage * STAFF_OVERAGE_RATE,
    staffCap,
    customerSlots: Math.max(0, customerCap - customerCount),
    overflowSlots: Math.max(0, hardCap - customerCount),
    staffSlots: Number.isFinite(staffCap) ? Math.max(0, staffCap - staffCount) : Number.POSITIVE_INFINITY,
    catalog: CATALOG[plan],
    subscriberBase: provider?.subscriber_base ?? 0,
    trial: trialStatus(provider?.trial_ends ?? ""),
  };
}

export type ChargeCatalogueItem = {
  id: number;
  name: string;
  kind: string;
  amount: number;
  tax_included: number;
  tax_percent: number;
};

export type DiscountCatalogueItem = {
  id: number;
  name: string;
  applies_to: string;
  frequency: string;
  mode: string;
  value: number;
};

export function listChargeCatalogue(providerId: number) {
  return many<ChargeCatalogueItem>(
    "SELECT id, name, kind, amount, tax_included, tax_percent FROM charge_catalogue WHERE provider_id = ? ORDER BY name",
    providerId,
  );
}

export function listDiscountCatalogue(providerId: number) {
  return many<DiscountCatalogueItem>(
    "SELECT id, name, applies_to, frequency, mode, value FROM discount_catalogue WHERE provider_id = ? ORDER BY name",
    providerId,
  );
}

export type PlanCoupon = {
  id: number;
  code: string;
  mode: "amount" | "percent";
  value: number;
  active: number;
};

export function listPlanCoupons() {
  return many<PlanCoupon>("SELECT id, code, mode, value, active FROM plan_coupons ORDER BY code");
}

export function findPlanCoupon(code: string) {
  return one<PlanCoupon>(
    "SELECT id, code, mode, value, active FROM plan_coupons WHERE lower(code) = ? AND active = 1",
    code.trim().toLowerCase(),
  );
}

export function findCataloguePromo(providerId: number, code: string) {
  return one<DiscountCatalogueItem>(
    "SELECT id, name, applies_to, frequency, mode, value FROM discount_catalogue WHERE provider_id = ? AND lower(name) = ?",
    providerId,
    code.trim().toLowerCase(),
  );
}

export function listPlans(providerId: number) {
  return many<Plan>(
    `SELECT p.*, (SELECT COUNT(*) FROM customers c WHERE c.plan_id = p.id) AS subscribers
     FROM plans p
     WHERE p.provider_id = ? AND p.listed = 1
     ORDER BY p.speed_mbps`,
    providerId,
  );
}

export function subscriberStatusCounts(providerId: number) {
  const rows = many<{ status: string; n: number }>(
    `SELECT c.status, COUNT(*) AS n
     FROM customers c
     JOIN users u ON u.id = c.user_id
     WHERE u.provider_id = ?
     GROUP BY c.status`,
    providerId,
  );
  const counts = { active: 0, suspended: 0, disconnected: 0, collection: 0, write_off: 0 };
  for (const row of rows) {
    if (isLineStatus(row.status)) counts[row.status] = row.n;
  }
  return counts;
}

export function listSubscribers(providerId: number, filters: { q?: string; status?: string; billing?: string; page?: number }) {
  const today = todayISO();
  const where = ["u.provider_id = ?"];
  const params: Array<string | number> = [providerId];

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push("(u.name LIKE ? OR u.email LIKE ? OR c.mobile LIKE ? OR c.city LIKE ? OR c.address LIKE ? OR c.area LIKE ?)");
    params.push(like, like, like, like, like, like);
  }
  if (filters.status && isLineStatus(filters.status)) {
    where.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters.billing === "overdue") {
    where.push("c.renew_date < ?");
    params.push(today);
  } else if (filters.billing === "due") {
    where.push("c.renew_date >= ? AND c.renew_date <= ?");
    params.push(today, addDays(today, 7));
  }

  const joined = `FROM customers c JOIN users u ON u.id = c.user_id JOIN plans p ON p.id = c.plan_id WHERE ${where.join(" AND ")}`;
  const total = one<{ n: number }>(`SELECT COUNT(*) AS n ${joined}`, ...params)?.n ?? 0;
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requested = filters.page && Number.isInteger(filters.page) && filters.page > 0 ? filters.page : 1;
  const page = Math.min(pages, requested);
  const rows = many<Subscriber>(
    `${subscriberSelect} WHERE ${where.join(" AND ")} ORDER BY c.renew_date ASC, u.name ASC LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  return { rows, total, page, pages };
}

export function getSubscriber(id: number, providerId: number) {
  return one<Subscriber>(`${subscriberSelect} WHERE c.id = ? AND u.provider_id = ?`, id, providerId);
}

export function getSubscriberByUserId(userId: number) {
  return one<Subscriber>(`${subscriberSelect} WHERE c.user_id = ?`, userId);
}

const PAYMENT_SORTS: Record<string, string> = {
  paid_at: "pay.paid_at",
  amount: "pay.amount",
  subscriber: "u.name",
  method: "pay.method",
  reference: "pay.reference",
  kind: "pay.kind",
};

export function listPayments(
  scope: { providerId: number } | { customerId: number },
  options?: { from?: string; to?: string; sort?: string; dir?: "asc" | "desc" },
) {
  const filters = ["providerId" in scope ? "u.provider_id = ?" : "pay.customer_id = ?"];
  const params: Array<string | number> = ["providerId" in scope ? scope.providerId : scope.customerId];
  if (options?.from) {
    filters.push("pay.paid_at >= ?");
    params.push(options.from);
  }
  if (options?.to) {
    filters.push("pay.paid_at < ?");
    params.push(options.to);
  }
  const column = PAYMENT_SORTS[options?.sort ?? ""] ?? "pay.paid_at";
  const dir = options?.dir === "asc" ? "ASC" : "DESC";
  return many<Payment>(
    `SELECT pay.*, u.name AS customer_name
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ${filters.join(" AND ")}
     ORDER BY ${column} ${dir}, pay.id DESC`,
    ...params,
  );
}

export function listProviderPayments(options?: { from?: string; to?: string; sort?: string; dir?: "asc" | "desc" }) {
  const filters: string[] = [];
  const params: Array<string | number> = [];
  if (options?.from) {
    filters.push("pay.paid_at >= ?");
    params.push(options.from);
  }
  if (options?.to) {
    filters.push("pay.paid_at < ?");
    params.push(options.to);
  }
  const sorts: Record<string, string> = { ...PAYMENT_SORTS, provider: "pr.name" };
  const column = sorts[options?.sort ?? ""] ?? "pay.paid_at";
  const dir = options?.dir === "asc" ? "ASC" : "DESC";
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return many<Payment & { provider_name: string }>(
    `SELECT pay.*, u.name AS customer_name, pr.name AS provider_name
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     JOIN providers pr ON pr.id = u.provider_id
     ${where}
     ORDER BY ${column} ${dir}, pay.id DESC`,
    ...params,
  );
}

export function paymentYears(providerId?: number) {
  const row = one<{ min: string | null; max: string | null }>(
    `SELECT MIN(pay.paid_at) AS min, MAX(pay.paid_at) AS max
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     ${providerId ? "WHERE u.provider_id = ?" : ""}`,
    ...(providerId ? [providerId] : []),
  );
  const now = new Date().getFullYear();
  const start = row?.min ? Number(row.min.slice(0, 4)) : now;
  const end = Math.max(now, row?.max ? Number(row.max.slice(0, 4)) : now);
  const years: number[] = [];
  for (let year = end; year >= start; year -= 1) years.push(year);
  return years;
}

export function listReminders(customerId: number) {
  return many<Reminder>("SELECT * FROM reminders WHERE customer_id = ? ORDER BY id DESC", customerId);
}

export function listComplaints(scope: { providerId: number } | { customerId: number }) {
  const where = "providerId" in scope ? "u.provider_id = ?" : "k.customer_id = ?";
  const param = "providerId" in scope ? scope.providerId : scope.customerId;
  return many<Complaint>(
    `SELECT k.*, u.name AS customer_name, COALESCE(a.name, '') AS assignee_name
     FROM complaints k
     JOIN customers c ON c.id = k.customer_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN users a ON a.id = k.assignee_id
     WHERE ${where}
     ORDER BY CASE k.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, k.created_at DESC`,
    param,
  );
}

export function getComplaint(id: number, providerId: number) {
  return one<Complaint>(
    `SELECT k.*, u.name AS customer_name, COALESCE(a.name, '') AS assignee_name
     FROM complaints k
     JOIN customers c ON c.id = k.customer_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN users a ON a.id = k.assignee_id
     WHERE k.id = ? AND u.provider_id = ?`,
    id,
    providerId,
  );
}

export function listStaff(providerId: number) {
  return many<StaffMember>(
    "SELECT id, name, email, mobile, login_password, is_owner FROM users WHERE provider_id = ? AND role = 'admin' ORDER BY is_owner DESC, name",
    providerId,
  );
}

export function dashboard(providerId: number) {
  const today = todayISO();
  const soon = addDays(today, 7);
  const horizon = addDays(today, 14);
  const { start, next } = monthBounds(today);
  const scope = "c.user_id IN (SELECT id FROM users WHERE provider_id = ?)";
  const active = one<{ n: number }>(`SELECT COUNT(*) AS n FROM customers c WHERE ${scope} AND c.status = 'active'`, providerId);
  const due = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM customers c WHERE ${scope} AND c.status = 'active' AND c.renew_date >= ? AND c.renew_date <= ?`,
    providerId,
    today,
    soon,
  );
  const overdue = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM customers c WHERE ${scope} AND c.renew_date < ?`,
    providerId,
    today,
  );
  const booked = one<{ n: number }>(
    `SELECT COALESCE(SUM(p.price), 0) AS n
     FROM customers c JOIN plans p ON p.id = c.plan_id
     WHERE ${scope} AND c.status = 'active'`,
    providerId,
  );
  const collected = one<{ n: number }>(
    `SELECT COALESCE(SUM(pay.amount), 0) AS n
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     WHERE ${scope} AND pay.paid_at >= ? AND pay.paid_at < ?`,
    providerId,
    start,
    next,
  );
  const renewals = many<Subscriber>(
    `${subscriberSelect} WHERE u.provider_id = ? AND c.renew_date <= ? ORDER BY c.renew_date ASC LIMIT 8`,
    providerId,
    horizon,
  );
  return {
    active: active?.n ?? 0,
    due: due?.n ?? 0,
    overdue: overdue?.n ?? 0,
    booked: booked?.n ?? 0,
    collected: collected?.n ?? 0,
    renewals,
    recent: listPayments({ providerId }).slice(0, 6),
    subscribers: one<{ n: number }>(`SELECT COUNT(*) AS n FROM customers c WHERE ${scope}`, providerId)?.n ?? 0,
    plans: one<{ n: number }>("SELECT COUNT(*) AS n FROM plans WHERE provider_id = ? AND listed = 1", providerId)?.n ?? 0,
  };
}

export type ImportIssue = { line: number; message: string };

export function getImportReport(providerId: number, batchId?: number, kind: "customers" | "plans" | "catalogue" | "payments" = "customers") {
  const batch = batchId
    ? one<{ id: number; imported: number; updated: number; skipped: number; created_at: string }>(
        "SELECT id, imported, updated, skipped, created_at FROM import_batches WHERE id = ? AND provider_id = ? AND kind = ?",
        batchId,
        providerId,
        kind,
      )
    : one<{ id: number; imported: number; updated: number; skipped: number; created_at: string }>(
        "SELECT id, imported, updated, skipped, created_at FROM import_batches WHERE provider_id = ? AND kind = ? ORDER BY id DESC LIMIT 1",
        providerId,
        kind,
      );
  if (!batch) return null;
  const issues = many<ImportIssue>("SELECT line, message FROM import_issues WHERE batch_id = ? ORDER BY line", batch.id);
  return { batch, issues };
}

export function collectionReport(providerId: number) {
  const { start, next } = monthBounds();
  const byPlan = many<{ plan_name: string; amount: number; count: number }>(
    `SELECT p.name AS plan_name, COALESCE(SUM(pay.amount), 0) AS amount, COUNT(pay.id) AS count
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     JOIN plans p ON p.id = c.plan_id
     WHERE u.provider_id = ? AND pay.paid_at >= ? AND pay.paid_at < ?
     GROUP BY p.id
     ORDER BY amount DESC`,
    providerId,
    start,
    next,
  );
  const byArea = many<{ area: string; amount: number; count: number }>(
    `SELECT CASE WHEN c.area = '' THEN 'Unassigned' ELSE c.area END AS area,
            COALESCE(SUM(pay.amount), 0) AS amount, COUNT(pay.id) AS count
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE u.provider_id = ? AND pay.paid_at >= ? AND pay.paid_at < ?
     GROUP BY area
     ORDER BY amount DESC`,
    providerId,
    start,
    next,
  );
  const total = byPlan.reduce((sum, row) => sum + row.amount, 0);
  return { start, next, byPlan, byArea, total };
}

export type OperatorProvider = {
  id: number;
  name: string;
  product_plan: string;
  support_phone: string;
  created_at: string;
  subscriber_base: number;
  subscribers: number;
  active: number;
  paused: number;
  overdue: number;
  billing_term: string;
};

export function operatorDesk() {
  const today = todayISO();
  const providers = many<OperatorProvider>(
    `SELECT p.id, p.name, p.product_plan, p.billing_term, p.support_phone, p.created_at, p.subscriber_base,
            (SELECT COUNT(*) FROM customers c JOIN users u ON u.id = c.user_id WHERE u.provider_id = p.id) AS subscribers,
            (SELECT COUNT(*) FROM customers c JOIN users u ON u.id = c.user_id WHERE u.provider_id = p.id AND c.status = 'active') AS active,
            (SELECT COUNT(*) FROM customers c JOIN users u ON u.id = c.user_id WHERE u.provider_id = p.id AND c.status = 'suspended') AS paused,
            (SELECT COUNT(*) FROM customers c JOIN users u ON u.id = c.user_id WHERE u.provider_id = p.id AND c.renew_date < ?) AS overdue
     FROM providers p
     ORDER BY p.name`,
    today,
  ).map((provider) => ({
    ...provider,
    product_plan: isProductPlan(provider.product_plan) ? provider.product_plan : "pro",
  }));
  const monthlyOf = (provider: (typeof providers)[number]) => {
    const term = isBillTerm(provider.billing_term) ? provider.billing_term : "monthly";
    return termQuote(CATALOG[provider.product_plan].price, term).perMonth;
  };
  const booked = providers.reduce((sum, provider) => sum + monthlyOf(provider), 0);
  const plans = (Object.keys(CATALOG) as ProductPlan[]).map((plan) => {
    const onPlan = providers.filter((provider) => provider.product_plan === plan);
    const price = CATALOG[plan].price;
    return {
      plan,
      label: CATALOG[plan].label,
      providers: onPlan.length,
      price,
      revenue: onPlan.reduce((sum, provider) => sum + monthlyOf(provider), 0),
    };
  });
  return {
    providers,
    booked,
    plans,
    subscribers: providers.reduce((sum, provider) => sum + provider.subscribers, 0),
    active: providers.reduce((sum, provider) => sum + provider.active, 0),
    paused: providers.reduce((sum, provider) => sum + provider.paused, 0),
    overdue: providers.reduce((sum, provider) => sum + provider.overdue, 0),
  };
}

export type { SupportFollowup, SupportRequest } from "@/lib/support";
export { SUPPORT_PRIORITIES, SUPPORT_TOPICS, supportCode } from "@/lib/support";

function recentMonthStarts(count: number) {
  const { start } = monthBounds();
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthStart = addMonths(start, -i);
    months.push({ start: monthStart, next: addMonths(monthStart, 1), key: monthStart.slice(0, 7), label: monthLabel(monthStart) });
  }
  return months;
}

function collectedBetween(providerId: number, start: string, next: string) {
  return (
    one<{ n: number }>(
      `SELECT COALESCE(SUM(pay.amount), 0) AS n
       FROM payments pay
       JOIN customers c ON c.id = pay.customer_id
       JOIN users u ON u.id = c.user_id
       WHERE u.provider_id = ? AND pay.paid_at >= ? AND pay.paid_at < ?`,
      providerId,
      start,
      next,
    )?.n ?? 0
  );
}

export type RevenuePoint = { label: string; amount: number | null; expected?: boolean };

export function providerRevenue(providerId: number, range?: { from: string; to: string; ahead?: boolean }) {
  const { start, next } = monthBounds();
  const lastStart = addMonths(start, -1);
  const current = collectedBetween(providerId, start, next);
  const past = collectedBetween(providerId, lastStart, start);
  const expected =
    one<{ n: number }>(
      `SELECT COALESCE(SUM(p.price), 0) AS n
       FROM customers c
       JOIN users u ON u.id = c.user_id
       JOIN plans p ON p.id = c.plan_id
       WHERE u.provider_id = ? AND c.status = 'active' AND c.renew_date >= ?`,
      providerId,
      next,
    )?.n ?? 0;
  const from = range?.from ?? `${start.slice(0, 4)}-01-01`;
  const to = range?.to ?? next;
  const series: RevenuePoint[] = [];
  let cursor = `${from.slice(0, 7)}-01`;
  const spansYears = from.slice(0, 4) !== addDays(to, -1).slice(0, 4);
  while (cursor < to) {
    const monthEnd = addMonths(cursor, 1);
    const sliceFrom = cursor < from ? from : cursor;
    const sliceTo = monthEnd < to ? monthEnd : to;
    const year = cursor.slice(0, 4);
    series.push({
      label: spansYears ? `${monthLabel(cursor)} ${year.slice(2)}` : monthLabel(cursor),
      amount: collectedBetween(providerId, sliceFrom, sliceTo),
    });
    cursor = monthEnd;
    if (series.length > 36) break;
  }
  if (!range || range.ahead) series.push({ label: "Ahead", amount: expected, expected: true });
  return { current, past, expected, series, from, to };
}

export function zignalRevenue() {
  const desk = operatorDesk();
  const { start, next } = monthBounds();
  const month = start.slice(0, 7);
  run(
    `INSERT INTO platform_fee_months (month, booked, providers) VALUES (?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET booked = excluded.booked, providers = excluded.providers`,
    month,
    desk.booked,
    desk.providers.length,
  );
  const saved = many<{ month: string; booked: number }>("SELECT month, booked FROM platform_fee_months");
  const byMonth = new Map(saved.map((row) => [row.month, row.booked]));
  const lastKey = addMonths(start, -1).slice(0, 7);
  const series: RevenuePoint[] = recentMonthStarts(6).map((item) => ({
    label: item.label,
    amount: byMonth.has(item.key) ? (byMonth.get(item.key) ?? 0) : null,
  }));
  series.push({ label: monthLabel(next), amount: desk.booked, expected: true });
  return {
    current: desk.booked,
    past: byMonth.has(lastKey) ? (byMonth.get(lastKey) ?? 0) : null,
    expected: desk.booked,
    providers: desk.providers.length,
    series,
  };
}

export type PlatformProfile = {
  legal_name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
};

export function getPlatformProfile(): PlatformProfile {
  return (
    one<PlatformProfile>(
      "SELECT legal_name, gstin, address, city, state, phone, email FROM platform_profile WHERE id = 1",
    ) ?? {
      legal_name: "Zignal Connect",
      gstin: "",
      address: "",
      city: "",
      state: "",
      phone: "",
      email: "",
    }
  );
}

export function deskMobile(userId: number) {
  return one<{ mobile: string }>("SELECT mobile FROM users WHERE id = ?", userId)?.mobile ?? "";
}

export function listSupport(scope: { providerId: number } | { all: true }) {
  const where = "providerId" in scope ? "WHERE s.provider_id = ?" : "";
  const params = "providerId" in scope ? [scope.providerId] : [];
  return many<SupportRequest>(
    `SELECT s.*, p.name AS provider_name, u.name AS sender_name
     FROM support_requests s
     JOIN providers p ON p.id = s.provider_id
     JOIN users u ON u.id = s.user_id
     ${where}
     ORDER BY CASE s.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, s.id DESC`,
    ...params,
  );
}

export function listSupportFollowups(requestIds: number[]) {
  if (requestIds.length === 0) return [];
  const marks = requestIds.map(() => "?").join(", ");
  return many<SupportFollowup>(
    `SELECT f.id, f.request_id, f.message, f.created_at, u.name AS sender_name
     FROM support_followups f
     JOIN users u ON u.id = f.user_id
     WHERE f.request_id IN (${marks})
     ORDER BY f.id`,
    ...requestIds,
  );
}
