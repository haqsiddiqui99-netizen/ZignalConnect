import { many, one } from "@/lib/db";
import { CATALOG, customerLimit, staffLimit, type ProductPlan } from "@/lib/entitlements";
import { addDays, monthBounds, todayISO } from "@/lib/format";

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

export function getUsage(providerId: number) {
  const provider = getProvider(providerId);
  const plan = provider?.product_plan ?? "free";
  const customers = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM customers c JOIN users u ON u.id = c.user_id WHERE u.provider_id = ?",
    providerId,
  );
  const staff = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE provider_id = ? AND role = 'admin'",
    providerId,
  );
  const customerCap = customerLimit(plan);
  const staffCap = staffLimit(plan);
  const customerCount = customers?.n ?? 0;
  const staffCount = staff?.n ?? 0;
  return {
    provider,
    plan,
    customers: customerCount,
    staff: staffCount,
    customerCap,
    staffCap,
    customerSlots: Number.isFinite(customerCap) ? Math.max(0, customerCap - customerCount) : Number.POSITIVE_INFINITY,
    staffSlots: Number.isFinite(staffCap) ? Math.max(0, staffCap - staffCount) : Number.POSITIVE_INFINITY,
    catalog: CATALOG[plan],
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

export function listPayments(scope: { providerId: number } | { customerId: number }) {
  const where = "providerId" in scope ? "WHERE u.provider_id = ?" : "WHERE pay.customer_id = ?";
  const param = "providerId" in scope ? scope.providerId : scope.customerId;
  return many<Payment>(
    `SELECT pay.*, u.name AS customer_name
     FROM payments pay
     JOIN customers c ON c.id = pay.customer_id
     JOIN users u ON u.id = c.user_id
     ${where}
     ORDER BY pay.paid_at DESC, pay.id DESC`,
    param,
  );
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
