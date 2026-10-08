import { many, one, run } from "@/lib/db";
import { addDays, formatDate, nowClock, todayISO } from "@/lib/format";

export type OpenPayment = {
  id: number;
  name: string;
  detail: string;
};

export type DeskQuit = {
  quitOn: string;
  reason: string;
  closedAt: string;
  phase: "open" | "scheduled" | "waiting" | "closed";
  open: OpenPayment[];
};

type QuitRow = { quit_on: string; quit_reason: string; closed_at: string };

function readQuit(providerId: number): QuitRow {
  const row = one<QuitRow>("SELECT quit_on, quit_reason, closed_at FROM providers WHERE id = ?", providerId);
  return {
    quit_on: row?.quit_on || "",
    quit_reason: row?.quit_reason || "",
    closed_at: row?.closed_at || "",
  };
}

export function openPayments(providerId: number, asOf: string): OpenPayment[] {
  const people = many<{
    id: number;
    name: string;
    renew_date: string;
    plan_frequency: string;
    plan_billed: number;
    plan_amount: number;
    price: number;
  }>(
    `SELECT c.id, u.name, c.renew_date, c.plan_frequency, c.plan_billed, c.plan_amount, p.price
     FROM customers c
     JOIN users u ON u.id = c.user_id
     JOIN plans p ON p.id = c.plan_id
     WHERE u.provider_id = ? AND c.status != 'write_off'
     ORDER BY u.name`,
    providerId,
  );
  const chargeIds = new Set(
    many<{ id: number }>(
      `SELECT DISTINCT c.id AS id
       FROM customer_charges ch
       JOIN customers c ON c.id = ch.customer_id
       JOIN users u ON u.id = c.user_id
       WHERE u.provider_id = ? AND c.status != 'write_off'
         AND ch.frequency = 'once' AND ch.billed = 0 AND ch.amount > 0`,
      providerId,
    ).map((row) => row.id),
  );
  const open: OpenPayment[] = [];
  for (const person of people) {
    const amount = person.plan_amount > 0 ? person.plan_amount : person.price;
    const onceOpen = person.plan_frequency === "once" && person.plan_billed === 0 && amount > 0;
    const cycleOpen = person.plan_frequency !== "once" && amount > 0 && (!person.renew_date || person.renew_date <= asOf);
    const chargeOpen = chargeIds.has(person.id);
    if (!onceOpen && !cycleOpen && !chargeOpen) continue;
    const detail = onceOpen
      ? "One-time plan is not paid"
      : cycleOpen
        ? person.renew_date
          ? `Due ${formatDate(person.renew_date)}`
          : "No renewal date is set"
        : "A one-time charge is still open";
    open.push({ id: person.id, name: person.name || "Subscriber", detail });
  }
  return open;
}

export function settleDesk(providerId: number): DeskQuit {
  const row = readQuit(providerId);
  if (row.closed_at) {
    return { quitOn: row.quit_on, reason: row.quit_reason, closedAt: row.closed_at, phase: "closed", open: [] };
  }
  const open = row.quit_on ? openPayments(providerId, row.quit_on) : [];
  if (row.quit_on && row.quit_on <= todayISO() && open.length === 0) {
    const closedAt = nowClock();
    run("UPDATE providers SET closed_at = ? WHERE id = ? AND closed_at = ''", closedAt, providerId);
    return { quitOn: row.quit_on, reason: row.quit_reason, closedAt, phase: "closed", open: [] };
  }
  const phase = !row.quit_on ? "open" : row.quit_on <= todayISO() ? "waiting" : "scheduled";
  return { quitOn: row.quit_on, reason: row.quit_reason, closedAt: "", phase, open };
}

export function settleDueDesks() {
  const today = todayISO();
  const due = many<{ id: number }>("SELECT id FROM providers WHERE quit_on != '' AND quit_on <= ? AND closed_at = ''", today);
  for (const desk of due) settleDesk(desk.id);
}

export function latestQuitDate() {
  return addDays(todayISO(), 366);
}

export function deskClosedMessage(userId: number) {
  const home = one<{ provider_id: number | null }>("SELECT provider_id FROM users WHERE id = ?", userId);
  if (!home?.provider_id) return "";
  const quit = settleDesk(home.provider_id);
  if (quit.phase !== "closed") return "";
  return `This desk closed on ${formatDate(quit.closedAt)}. Sign-in has stopped.`;
}
