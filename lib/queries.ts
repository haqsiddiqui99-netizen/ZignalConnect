import { many, one, run } from "@/lib/db";
import { CATALOG, OVERAGE_RATE, customerLimit, isProductPlan, overflowLimit, staffLimit, type ProductPlan } from "@/lib/entitlements";
import { addDays, addMonths, daysUntil, monthBounds, monthLabel, todayISO } from "@/lib/format";

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
  area: string;
  status: "active" | "suspended";
  plan_id: number;
  plan_name: string;
  speed_mbps: number;
  price: number;
  data_cap: string;
  plan_description: string;
  renew_date: string;
  installation_date: string;
  notes: string;
};

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
  status: "open" | "in_progress" | "resolved";
  provider_note: string;
  created_at: string;
  updated_at: string;
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
};

const subscriberSelect = `
  SELECT
    c.id, c.user_id, u.name, u.email, c.mobile, c.address, c.city, c.area, c.status,
    c.plan_id, p.name AS plan_name, p.speed_mbps, p.price, p.data_cap,
    p.description AS plan_description, c.renew_date, c.installation_date, c.notes
  FROM customers c
  JOIN users u ON u.id = c.user_id
  JOIN plans p ON p.id = c.plan_id
`;

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
  return {
    provider,
    plan,
    customers: customerCount,
    staff: staffCount,
    customerCap,
    overflowCap: hardCap,
    overage,
    overageDue: overage * OVERAGE_RATE,
    staffCap,
    customerSlots: Math.max(0, customerCap - customerCount),
    overflowSlots: Math.max(0, hardCap - customerCount),
    staffSlots: Number.isFinite(staffCap) ? Math.max(0, staffCap - staffCount) : Number.POSITIVE_INFINITY,
    catalog: CATALOG[plan],
    subscriberBase: provider?.subscriber_base ?? 0,
    trial: trialStatus(provider?.trial_ends ?? ""),
  };
}

export function listPlans(providerId: number) {
  return many<Plan>(
    `SELECT p.*, (SELECT COUNT(*) FROM customers c WHERE c.plan_id = p.id) AS subscribers
     FROM plans p
     WHERE p.provider_id = ?
     ORDER BY p.speed_mbps`,
    providerId,
  );
}

export function listSubscribers(providerId: number, filters: { q?: string; status?: string; billing?: string }) {
  const today = todayISO();
  const where = ["u.provider_id = ?"];
  const params: Array<string | number> = [providerId];

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push("(u.name LIKE ? OR u.email LIKE ? OR c.mobile LIKE ? OR c.city LIKE ? OR c.address LIKE ? OR c.area LIKE ?)");
    params.push(like, like, like, like, like, like);
  }
  if (filters.status === "active" || filters.status === "suspended") {
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

  return many<Subscriber>(
    `${subscriberSelect} WHERE ${where.join(" AND ")} ORDER BY c.renew_date ASC, u.name ASC`,
    ...params,
  );
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
    `SELECT k.*, u.name AS customer_name
     FROM complaints k
     JOIN customers c ON c.id = k.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE ${where}
     ORDER BY CASE k.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, k.id DESC`,
    param,
  );
}

export function getComplaint(id: number, providerId: number) {
  return one<Complaint>(
    `SELECT k.*, u.name AS customer_name
     FROM complaints k
     JOIN customers c ON c.id = k.customer_id
     JOIN users u ON u.id = c.user_id
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
    plans: one<{ n: number }>("SELECT COUNT(*) AS n FROM plans WHERE provider_id = ?", providerId)?.n ?? 0,
  };
}

export type ImportIssue = { line: number; message: string };

export function getImportReport(providerId: number, batchId?: number) {
  const batch = batchId
    ? one<{ id: number; imported: number; skipped: number; created_at: string }>(
        "SELECT id, imported, skipped, created_at FROM import_batches WHERE id = ? AND provider_id = ?",
        batchId,
        providerId,
      )
    : one<{ id: number; imported: number; skipped: number; created_at: string }>(
        "SELECT id, imported, skipped, created_at FROM import_batches WHERE provider_id = ? ORDER BY id DESC LIMIT 1",
        providerId,
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
};

export function operatorDesk() {
  const today = todayISO();
  const providers = many<OperatorProvider>(
    `SELECT p.id, p.name, p.product_plan, p.support_phone, p.created_at, p.subscriber_base,
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
  const booked = providers.reduce((sum, provider) => sum + CATALOG[provider.product_plan].price, 0);
  const plans = (Object.keys(CATALOG) as ProductPlan[]).map((plan) => ({
    plan,
    label: CATALOG[plan].label,
    providers: providers.filter((provider) => provider.product_plan === plan).length,
  }));
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

export type SupportRequest = {
  id: number;
  provider_id: number;
  provider_name: string;
  user_id: number;
  sender_name: string;
  mobile: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  reply: string;
  created_at: string;
  updated_at: string;
};

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
     ORDER BY CASE s.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, s.id DESC`,
    ...params,
  );
}
