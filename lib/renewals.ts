import { billCycleLabel } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import { many, one, run } from "@/lib/db";
import { allows } from "@/lib/entitlements";
import { daysUntil, formatDate, formatInr, formatSpeed, nowStamp } from "@/lib/format";
import { getProvider, getSubscriber, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";

type DueLine = {
  id: number;
  renew_date: string;
  status: string;
  reminders: number;
  name: string;
};

export const REMINDER_DEFAULTS = {
  soonTitle: "Renewal in 3 days",
  soonBody: "{plan} renews on {date}. The amount due is {amount}. Please pay within the next 3 days.",
  dueTitle: "Last day to pay",
  dueBody: "Today, {date}, is the last day to pay {amount} for {plan}. If the bill is not paid, the connection will be disconnected.",
};

function fillReminder(
  template: string,
  fields: { name: string; plan: string; date: string; amount: string; isp: string },
) {
  return template
    .replaceAll("{name}", fields.name)
    .replaceAll("{plan}", fields.plan)
    .replaceAll("{date}", fields.date)
    .replaceAll("{amount}", fields.amount)
    .replaceAll("{isp}", fields.isp);
}

function amountDue(customerId: number, providerId: number) {
  const person = getSubscriber(customerId, providerId);
  if (!person) return null;
  const due = invoiceFor(person, listCustomerCharges(person.id), {
    discounts: listCustomerDiscounts(person.id),
    extraPlans: listCustomerExtraPlans(person.id),
  }).due;
  return { person, due };
}

export function postOnboardingMessage(customerId: number, providerId: number, password: string) {
  if (one("SELECT id FROM reminders WHERE customer_id = ? AND stage = 'onboard'", customerId)) return;
  const billed = amountDue(customerId, providerId);
  const provider = getProvider(providerId);
  if (!billed || !provider) return;
  const { person, due } = billed;
  const amount = due > 0 ? due : person.plan_amount || person.price;
  const plan = `${person.plan_name} · ${formatSpeed(person.speed_mbps)} · ${billCycleLabel(person.bill_cycle).toLowerCase()} · ${formatInr(amount)}`;
  const title = `Welcome to ${provider.name}`.slice(0, 80);
  const body = `Your plan is ${plan}. The next payment date is ${formatDate(person.renew_date)}. Sign in with ${person.email}. The password is ${password}.`;
  run(
    "INSERT INTO reminders (customer_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'portal', 'onboard', '')",
    customerId,
    title,
    body.slice(0, 400),
    nowStamp(),
  );
}

export function issueRenewalReminders(providerId: number) {
  const provider = getProvider(providerId);
  if (!provider || !allows(provider.product_plan, "renewalReminders")) return 0;

  const lines = many<DueLine>(
    `SELECT c.id, c.renew_date, c.status, c.reminders, u.name
     FROM customers c
     JOIN users u ON u.id = c.user_id
     WHERE u.provider_id = ?`,
    providerId,
  );
  let created = 0;
  for (const line of lines) {
    if (!line.reminders) continue;
    if (line.status === "suspended" || line.status === "disconnected" || line.status === "write_off") continue;
    const days = daysUntil(line.renew_date);
    const stage = days === 3 ? "soon" : days === 0 ? "due" : null;
    if (!stage) continue;
    const existing = one(
      "SELECT id FROM reminders WHERE customer_id = ? AND stage = ? AND cycle_date = ?",
      line.id,
      stage,
      line.renew_date,
    );
    if (existing) continue;
    const billed = amountDue(line.id, providerId);
    if (!billed || billed.due <= 0) continue;
    const fields = {
      name: line.name,
      plan: billed.person.plan_name,
      date: formatDate(line.renew_date),
      amount: formatInr(billed.due),
      isp: provider.name,
    };
    const title = (stage === "soon" ? provider.reminder_soon_title : provider.reminder_due_title) || (stage === "soon" ? REMINDER_DEFAULTS.soonTitle : REMINDER_DEFAULTS.dueTitle);
    const body = (stage === "soon" ? provider.reminder_soon_body : provider.reminder_due_body) || (stage === "soon" ? REMINDER_DEFAULTS.soonBody : REMINDER_DEFAULTS.dueBody);
    run(
      "INSERT INTO reminders (customer_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'portal', ?, ?)",
      line.id,
      fillReminder(title, fields).slice(0, 80),
      fillReminder(body, fields).slice(0, 400),
      nowStamp(),
      stage,
      line.renew_date,
    );
    created += 1;
  }
  return created;
}
