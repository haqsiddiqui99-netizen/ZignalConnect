import { ProviderTable, type ProviderRow } from "@/components/provider-table";
import { requireOperator } from "@/lib/auth";
import { BILL_TERMS, CATALOG, isBillTerm, type ProductPlan } from "@/lib/entitlements";
import { addMonths, daysUntil, formatClock, formatDate, formatInr, todayISO } from "@/lib/format";
import { operatorDesk } from "@/lib/queries";

function trialText(ends: string) {
  if (!ends) return "—";
  const clock = formatClock(ends);
  if (daysUntil(ends.slice(0, 10)) < 0) return `Ended ${clock}`;
  return clock;
}

function isPlan(value: string): value is ProductPlan {
  return value in CATALOG;
}

function paymentDue(trialEnds: string, opened: string, term: string) {
  const months = term === "yearly" ? 12 : term === "quarterly" ? 3 : 1;
  const today = todayISO();
  const trial = trialEnds.slice(0, 10);
  if (trial && daysUntil(trial) >= 0) return trial;
  let due = (trial || opened).slice(0, 10);
  if (!due) return "";
  for (let guard = 0; due < today && guard < 240; guard += 1) due = addMonths(due, months);
  return due;
}

export const metadata = { title: "Providers" };

export default async function OperatorHome() {
  await requireOperator();
  const desk = operatorDesk();
  const rows: ProviderRow[] = desk.providers.map((provider) => {
    const place = [provider.city, provider.state].filter(Boolean).join(", ");
    const termId = isBillTerm(provider.billing_term) ? provider.billing_term : "monthly";
    const term = BILL_TERMS.find((item) => item.id === termId)?.label ?? "Monthly";
    const plan = isPlan(provider.product_plan) ? CATALOG[provider.product_plan].label : provider.product_plan;
    const due = provider.closed_at ? "" : paymentDue(provider.trial_ends, provider.created_at, termId);
    const desk = provider.closed_at
      ? `Closed ${formatDate(provider.closed_at)}`
      : provider.quit_on && provider.quit_on <= todayISO()
        ? "Waiting on payments"
        : provider.quit_on
          ? `Closing ${formatDate(provider.quit_on)}`
          : "Open";
    const stateKind = provider.closed_at ? "closed" : provider.quit_on && provider.quit_on <= todayISO() ? "waiting" : provider.quit_on ? "closing" : "open";
    return {
      id: provider.id,
      isp: provider.name,
      owner: [provider.owner_name, provider.owner_email].filter(Boolean).join(" · "),
      place,
      plan,
      term,
      book: provider.subscriber_base > 0 ? String(provider.subscriber_base) : "—",
      opened: formatClock(provider.created_at),
      openedSort: provider.created_at,
      lastLogin: provider.last_login ? formatClock(provider.last_login) : "Not yet",
      lastLoginSort: provider.last_login,
      trial: trialText(provider.trial_ends),
      trialSort: provider.trial_ends,
      paymentDue: due ? formatClock(due) : "—",
      paymentDueSort: due,
      fee: formatInr(provider.fee),
      staff: String(provider.staff),
      support: provider.support_phone || "—",
      subscribers: String(provider.subscribers),
      active: String(provider.active),
      paused: String(provider.paused),
      overdue: String(provider.overdue),
      desk,
      stateKind,
    };
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Providers</h1>
          <p>
            {desk.providers.length} ISP desks. Booked desk fees are {formatInr(desk.booked)} a month. No card has been
            charged.
          </p>
        </div>
      </header>
      <section className="stats">
        <article className="stat">
          <span>Providers</span>
          <b>{desk.providers.length}</b>
        </article>
        <article className="stat">
          <span>Booked desk fees</span>
          <b className="money">{formatInr(desk.booked)}</b>
        </article>
        <article className="stat">
          <span>Active lines</span>
          <b>{desk.active}</b>
        </article>
        <article className="stat">
          <span>Paused lines</span>
          <b>{desk.paused}</b>
        </article>
      </section>
      <article className="card" style={{ marginBottom: 16 }}>
        <p>
          {desk.subscribers} subscribers across every desk. {desk.overdue} lines are past their renewal date. A past-due
          line stays active until someone sets it to Paused, Disconnect, Collection, or Write off.
        </p>
        <p className="fine" style={{ marginTop: 8 }}>
          {desk.plans.map((item) => `${item.label} ${item.providers}`).join(" · ")}. Fees are {formatInr(CATALOG.pro.price)}{" "}
          Pro, {formatInr(CATALOG.ultra.price)} Ultra, and {formatInr(CATALOG.premium_3000.price)} to{" "}
          {formatInr(CATALOG.premium_30000.price)} across the Premium tiers.
        </p>
      </article>
      <article className="card">
        {desk.providers.length === 0 ? (
          <p>No providers yet.</p>
        ) : (
          <ProviderTable rows={rows} />
        )}
      </article>
    </>
  );
}
