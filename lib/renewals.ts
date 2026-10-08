import { billCycleLabel } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import { many, one, run } from "@/lib/db";
import { BILL_TERMS, CATALOG, allows, isBillTerm, isProductPlan, termQuote, type BillTerm, type ProductPlan } from "@/lib/entitlements";
import { addMonths, daysUntil, formatDate, formatInr, formatSpeed, nowStamp, todayISO } from "@/lib/format";
import { mailConfigured, renewalMail, sendMail } from "@/lib/mail";
import { deskMailSettings, getProvider, getSubscriber, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";

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

export function postOnboardingMessage(customerId: number, providerId: number) {
  if (one("SELECT id FROM reminders WHERE customer_id = ? AND stage = 'onboard'", customerId)) return;
  const billed = amountDue(customerId, providerId);
  const provider = getProvider(providerId);
  if (!billed || !provider) return;
  const { person, due } = billed;
  const amount = due > 0 ? due : person.plan_amount || person.price;
  const plan = `${person.plan_name} · ${formatSpeed(person.speed_mbps)} · ${billCycleLabel(person.bill_cycle).toLowerCase()} · ${formatInr(amount)}`;
  const title = `Welcome to ${provider.name}`.slice(0, 80);
  const body = `Your plan is ${plan}. The next payment date is ${formatDate(person.renew_date)}. Sign-in details were sent to ${person.email}.`;
  run(
    "INSERT INTO reminders (customer_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'email', 'onboard', '')",
    customerId,
    title,
    body.slice(0, 400),
    nowStamp(),
  );
}

export async function issueRenewalReminders(providerId: number) {
  const provider = getProvider(providerId);
  if (!provider || !allows(provider.product_plan, "renewalReminders")) return { emailed: 0, failed: 0 };

  const lines = many<DueLine>(
    `SELECT c.id, c.renew_date, c.status, c.reminders, u.name
     FROM customers c
     JOIN users u ON u.id = c.user_id
     WHERE u.provider_id = ?`,
    providerId,
  );
  let emailed = 0;
  let failed = 0;
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
    const title = fillReminder(
      (stage === "soon" ? provider.reminder_soon_title : provider.reminder_due_title) ||
        (stage === "soon" ? REMINDER_DEFAULTS.soonTitle : REMINDER_DEFAULTS.dueTitle),
      fields,
    ).slice(0, 80);
    const body = fillReminder(
      (stage === "soon" ? provider.reminder_soon_body : provider.reminder_due_body) ||
        (stage === "soon" ? REMINDER_DEFAULTS.soonBody : REMINDER_DEFAULTS.dueBody),
      fields,
    ).slice(0, 400);
    if (!mailConfigured()) continue;
    const mail = renewalMail({ ispName: provider.name, signoff: provider.name, title, body });
    const sent = await sendMail(billed.person.email, mail.subject, mail.text, mail.html);
    if (!sent.ok) {
      failed += 1;
      continue;
    }
    run(
      "INSERT INTO reminders (customer_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'email', ?, ?)",
      line.id,
      title,
      body,
      nowStamp(),
      stage,
      line.renew_date,
    );
    emailed += 1;
  }
  return { emailed, failed };
}

function nextDeskFeeDate(trialEnds: string, opened: string, term: BillTerm) {
  const months = term === "yearly" ? 12 : term === "quarterly" ? 3 : 1;
  const today = todayISO();
  const trial = trialEnds.slice(0, 10);
  if (trial && daysUntil(trial) >= 0) return trial;
  let due = (trial || opened).slice(0, 10);
  if (!due) return "";
  for (let guard = 0; due < today && guard < 240; guard += 1) due = addMonths(due, months);
  return due;
}

export function postDeskWelcome(providerId: number, title: string, body: string) {
  if (one("SELECT id FROM desk_notices WHERE provider_id = ? AND stage = 'onboard'", providerId)) return;
  run(
    "INSERT INTO desk_notices (provider_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'email', 'onboard', '')",
    providerId,
    title.slice(0, 80),
    body.slice(0, 400),
    nowStamp(),
  );
}

export async function issueDeskFeeReminders(providerId: number) {
  const settings = deskMailSettings();
  if (!settings.on) return { emailed: 0, failed: 0 };
  const provider = getProvider(providerId);
  if (!provider || provider.closed_at) return { emailed: 0, failed: 0 };
  const owner = one<{ email: string; name: string }>(
    "SELECT email, name FROM users WHERE provider_id = ? AND is_owner = 1 LIMIT 1",
    providerId,
  );
  if (!owner?.email) return { emailed: 0, failed: 0 };
  const plan: ProductPlan = isProductPlan(provider.product_plan) ? provider.product_plan : "pro";
  const term: BillTerm = isBillTerm(provider.billing_term) ? provider.billing_term : "monthly";
  const dueOn = nextDeskFeeDate(provider.trial_ends, provider.created_at, term);
  if (!dueOn) return { emailed: 0, failed: 0 };
  const days = daysUntil(dueOn);
  const stage = days === 3 ? "soon" : days === 0 ? "due" : null;
  if (!stage) return { emailed: 0, failed: 0 };
  if (one("SELECT id FROM desk_notices WHERE provider_id = ? AND stage = ? AND cycle_date = ?", providerId, stage, dueOn)) {
    return { emailed: 0, failed: 0 };
  }
  const quote = termQuote(CATALOG[plan].price, term);
  const termLabel = BILL_TERMS.find((item) => item.id === term)?.label ?? "Monthly";
  const fields = {
    name: owner.name,
    plan: `${CATALOG[plan].label} · ${termLabel}`,
    date: formatDate(dueOn),
    amount: formatInr(quote.due),
    isp: provider.name,
  };
  const title = fillReminder(stage === "soon" ? settings.soonTitle : settings.dueTitle, fields).slice(0, 80);
  const body = fillReminder(stage === "soon" ? settings.soonBody : settings.dueBody, fields).slice(0, 400);
  if (!mailConfigured()) return { emailed: 0, failed: 0 };
  const mail = renewalMail({ ispName: provider.name, signoff: "Zignal Connect", title, body });
  const sent = await sendMail(owner.email, mail.subject, mail.text, mail.html);
  if (!sent.ok) return { emailed: 0, failed: 1 };
  run(
    "INSERT INTO desk_notices (provider_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'email', ?, ?)",
    providerId,
    title,
    body,
    nowStamp(),
    stage,
    dueOn,
  );
  return { emailed: 1, failed: 0 };
}

export async function sendDeskNote(providerId: number, title: string, body: string) {
  const provider = getProvider(providerId);
  if (!provider || provider.closed_at) return { ok: false as const };
  const owner = one<{ email: string; name: string }>(
    "SELECT email, name FROM users WHERE provider_id = ? AND is_owner = 1 LIMIT 1",
    providerId,
  );
  if (!owner?.email || !mailConfigured()) return { ok: false as const };
  const plan: ProductPlan = isProductPlan(provider.product_plan) ? provider.product_plan : "pro";
  const term: BillTerm = isBillTerm(provider.billing_term) ? provider.billing_term : "monthly";
  const dueOn = nextDeskFeeDate(provider.trial_ends, provider.created_at, term);
  const termLabel = BILL_TERMS.find((item) => item.id === term)?.label ?? "Monthly";
  const fields = {
    name: owner.name,
    plan: `${CATALOG[plan].label} · ${termLabel}`,
    date: dueOn ? formatDate(dueOn) : "",
    amount: formatInr(termQuote(CATALOG[plan].price, term).due),
    isp: provider.name,
  };
  const filledTitle = fillReminder(title, fields).slice(0, 80);
  const filledBody = fillReminder(body, fields).slice(0, 400);
  const mail = renewalMail({ ispName: provider.name, signoff: "Zignal Connect", title: filledTitle, body: filledBody });
  const sent = await sendMail(owner.email, mail.subject, mail.text, mail.html);
  if (!sent.ok) return { ok: false as const };
  run(
    "INSERT INTO desk_notices (provider_id, title, body, created_at, channel, stage, cycle_date) VALUES (?, ?, ?, ?, 'email', 'custom', ?)",
    providerId,
    filledTitle,
    filledBody,
    nowStamp(),
    `${Date.now()}-${providerId}`,
  );
  return { ok: true as const };
}

export async function runMorningReminders() {
  const providers = many<{ id: number }>("SELECT id FROM providers");
  let emailed = 0;
  let failed = 0;
  for (const provider of providers) {
    const result = await issueRenewalReminders(provider.id);
    const desk = await issueDeskFeeReminders(provider.id);
    emailed += result.emailed + desk.emailed;
    failed += result.failed + desk.failed;
  }
  return { emailed, failed };
}
