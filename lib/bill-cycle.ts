export const BILL_CYCLES = [
  { value: "monthly", label: "Monthly", months: 1, advance: "one month" },
  { value: "quarterly", label: "Quarterly", months: 3, advance: "three months" },
  { value: "biannual", label: "Bi-annually", months: 6, advance: "six months" },
  { value: "annual", label: "Annually", months: 12, advance: "one year" },
] as const;

export type BillCycle = (typeof BILL_CYCLES)[number]["value"];

const IMPORT_CYCLE: Record<string, BillCycle> = {
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
  return BILL_CYCLES.find((item) => item.value === value) ?? BILL_CYCLES[0];
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
  return monthlyPrice * billCycleMonths(value);
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
