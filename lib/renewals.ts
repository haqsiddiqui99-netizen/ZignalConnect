import { many, one, run } from "@/lib/db";
import { allows } from "@/lib/entitlements";
import { daysUntil, formatDate, formatInr, nowStamp } from "@/lib/format";
import { getProvider } from "@/lib/queries";

type DueLine = {
  id: number;
  renew_date: string;
  status: string;
  plan_name: string;
  price: number;
  reminders: number;
};

const STAGES = {
  d3: {
    title: "Renewal in 3 days",
    body: (plan: string, date: string, price: string) =>
      `${plan} renews on ${date}. The amount due is ${price}. Please pay within the next 3 days.`,
  },
  d1: {
    title: "Renewal is tomorrow",
    body: (plan: string, date: string, price: string) =>
      `${plan} is due tomorrow, ${date}. Pay ${price} so the connection stays active.`,
  },
  due: {
    title: "Last day to pay",
    body: (plan: string, date: string, price: string) =>
      `Today, ${date}, is the last day to pay ${price} for ${plan}. If the bill is not paid, the connection will be disconnected.`,
  },
} as const;

export function issueRenewalReminders(providerId: number) {
  const provider = getProvider(providerId);
  if (!provider || !allows(provider.product_plan, "renewalReminders")) return 0;

  const lines = many<DueLine>(
    `SELECT c.id, c.renew_date, c.status, c.reminders, p.name AS plan_name, p.price
     FROM customers c
     JOIN users u ON u.id = c.user_id
     JOIN plans p ON p.id = c.plan_id
     WHERE u.provider_id = ?`,
    providerId,
  );
  let created = 0;
  for (const line of lines) {
    if (!line.reminders) continue;
    if (line.status === "suspended" || line.status === "disconnected" || line.status === "write_off") continue;
    const days = daysUntil(line.renew_date);
    const stage = days === 3 ? "d3" : days === 1 ? "d1" : days === 0 ? "due" : null;
    if (!stage) continue;
    const existing = one(
      "SELECT id FROM reminders WHERE customer_id = ? AND stage = ? AND cycle_date = ?",
      line.id,
      stage,
      line.renew_date,
    );
    if (existing) continue;
    const copy = STAGES[stage];
    run(
      "INSERT INTO reminders (customer_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'portal', ?, ?)",
      line.id,
      copy.title,
      copy.body(line.plan_name, formatDate(line.renew_date), formatInr(line.price)),
      nowStamp(),
      stage,
      line.renew_date,
    );
    created += 1;
  }
  return created;
}
