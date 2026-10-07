import { addDays, addMonths } from "@/lib/format";

export const BILL_CYCLES = [
  { value: "weekly", label: "Weekly", months: 0, days: 7, advance: "one week" },
  { value: "biweekly", label: "Bi-weekly", months: 0, days: 14, advance: "two weeks" },
  { value: "monthly", label: "Monthly", months: 1, days: 0, advance: "one month" },
  { value: "quarterly", label: "Quarterly", months: 3, days: 0, advance: "three months" },
  { value: "biannual", label: "Bi-annual", months: 6, days: 0, advance: "six months" },
  { value: "annual", label: "Annual", months: 12, days: 0, advance: "one year" },
] as const;

export type BillCycle = (typeof BILL_CYCLES)[number]["value"];

const IMPORT_CYCLE: Record<string, BillCycle> = {
  weekly: "weekly",
  week: "weekly",
  "bi-weekly": "biweekly",
  biweekly: "biweekly",
  "bi weekly": "biweekly",
  fortnight: "biweekly",
  fortnightly: "biweekly",
  monthly: "monthly",
  month: "monthly",
  quarterly: "quarterly",
  quarter: "quarterly",
  "bi-annually": "biannual",
  "bi-annual": "biannual",
  biannually: "biannual",
  biannual: "biannual",
  "half-yearly": "biannual",
  "half yearly": "biannual",
  annually: "annual",
  annual: "annual",
  yearly: "annual",
  year: "annual",
};

export function isBillCycle(value: string): value is BillCycle {
  return BILL_CYCLES.some((item) => item.value === value);
}

export function billCycleOf(value: string): (typeof BILL_CYCLES)[number] {
  return BILL_CYCLES.find((item) => item.value === value) ?? BILL_CYCLES[2];
}

export function billCycleLabel(value: string) {
  return billCycleOf(value).label;
}

export function billCycleMonths(value: string) {
  return billCycleOf(value).months;
}

export function billCycleAdvance(value: string) {
  return billCycleOf(value).advance;
}

export function cycleAmount(monthlyPrice: number, value: string) {
  const cycle = billCycleOf(value);
  if (cycle.value === "weekly") return Math.round(monthlyPrice / 4);
  if (cycle.value === "biweekly") return Math.round(monthlyPrice / 2);
  return monthlyPrice * cycle.months;
}

function daySpan(start: string, end: string) {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  return Math.round((new Date(ye, me - 1, de).getTime() - new Date(ys, ms - 1, ds).getTime()) / 86_400_000);
}

export function incompleteCycleCharge(activated: string, renews: string, today: string, amount: number) {
  const cycleDays = daySpan(activated, renews);
  const valid = cycleDays > 0;
  const incomplete = valid && today >= activated && today < renews;
  const usedDays = !valid || today < activated ? 0 : Math.min(cycleDays, daySpan(activated, today) + 1);
  const full = Math.max(0, amount);
  const prorate = valid ? Math.round((full * usedDays) / cycleDays) : 0;
  return { incomplete, cycleDays: Math.max(0, cycleDays), usedDays, full, prorate };
}

export function renewalAfterInstallation(installation: string, cycle: string) {
  const item = billCycleOf(cycle);
  if (item.days > 0) return addDays(installation, item.days);
  return addMonths(installation, item.months || 1);
}

export function nextRenewalDate(currentRenew: string, today: string, cycle: string) {
  const item = billCycleOf(cycle);
  const base = currentRenew > today ? currentRenew : today;
  if (item.days > 0) return addDays(base, item.days);
  return addMonths(base, item.months);
}

export function billCycleFromImport(value: string): BillCycle | "invalid" {
  const key = value.trim().toLowerCase();
  if (!key) return "monthly";
  return IMPORT_CYCLE[key] ?? "invalid";
}

export function remindersFromImport(value: string): boolean | "invalid" {
  const key = value.trim().toLowerCase();
  if (!key) return true;
  if (["yes", "y", "on", "send", "1"].includes(key)) return true;
  if (["no", "n", "off", "stop", "0"].includes(key)) return false;
  return "invalid";
}
