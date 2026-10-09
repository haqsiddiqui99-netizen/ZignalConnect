import { cycleAfter, nextRenewalDate } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import { many, run } from "@/lib/db";
import { addDays, isDate, todayISO } from "@/lib/format";
import { pushLine } from "@/lib/line-link";
import { getProvider, getSubscriber, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";

export const PROMISE_WINDOW_DAYS = 14;

export function promiseWindow(renewDate: string, today = todayISO()) {
  const due = isDate(renewDate) && renewDate > today ? renewDate : today;
  return { earliest: addDays(due, 1), latest: addDays(due, PROMISE_WINDOW_DAYS) };
}

export function promiseAllowed(person: { status: string }, due: number) {
  if (due <= 0) return false;
  return person.status === "active" || person.status === "disconnected";
}

export function renewalAfterPayment(renewDate: string, promiseOn: string, paidOn: string, cycle: string) {
  if (isDate(promiseOn) && paidOn <= promiseOn && isDate(renewDate)) return cycleAfter(renewDate, cycle);
  return nextRenewalDate(renewDate, paidOn, cycle);
}

async function pushCustomerLine(providerId: number, lineName: string, up: boolean) {
  const provider = getProvider(providerId);
  const kind = provider?.line_kind === "mikrotik" || provider?.line_kind === "radius" ? provider.line_kind : "";
  if (!kind || !lineName) return;
  await pushLine(
    {
      kind,
      host: provider?.line_host ?? "",
      port: provider?.line_port ?? 0,
      user: provider?.line_user ?? "",
      secret: provider?.line_secret ?? "",
      database: provider?.line_db ?? "",
      coaSecret: provider?.line_coa ?? "",
    },
    lineName,
    up,
  );
}

export function settleExpiredDeskPromises(today = todayISO()) {
  run("UPDATE providers SET promise_on = '' WHERE promise_on <> '' AND promise_on < ?", today);
}

export async function settleExpiredPromises(today = todayISO()) {
  const due = many<{ id: number; provider_id: number }>(
    `SELECT c.id, u.provider_id
     FROM customers c
     JOIN users u ON u.id = c.user_id
     WHERE c.promise_on <> '' AND c.promise_on < ?`,
    today,
  );
  for (const row of due) {
    const person = getSubscriber(row.id, row.provider_id);
    if (!person || !person.promise_on || person.promise_on >= today) continue;
    const open = invoiceFor(person, listCustomerCharges(person.id), {
      discounts: listCustomerDiscounts(person.id),
      extraPlans: listCustomerExtraPlans(person.id),
    }).due;
    const cut = open > 0 && (person.disconnect_unpaid === 1 || person.promise_was_down === 1);
    if (cut && person.status !== "disconnected" && person.status !== "collection" && person.status !== "write_off") {
      run("UPDATE customers SET promise_on = '', promise_was_down = 0, status = 'disconnected' WHERE id = ?", person.id);
      await pushCustomerLine(row.provider_id, person.line_name, false);
      continue;
    }
    run("UPDATE customers SET promise_on = '', promise_was_down = 0 WHERE id = ?", person.id);
  }
}
