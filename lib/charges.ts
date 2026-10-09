import { billCycleLabel, cycleAmount, isBillCycle } from "@/lib/bill-cycle";
import { formatDate, formatInr, isDate } from "@/lib/format";
import { invoiceTotals } from "@/lib/tax";

export const CHARGE_KINDS = [
  { value: "router", label: "Router charge" },
  { value: "installation", label: "Installation charge" },
  { value: "service", label: "Service charge" },
  { value: "other", label: "Other" },
] as const;

export type ChargeKind = (typeof CHARGE_KINDS)[number]["value"];
export type ChargeFrequency = "once" | "recurring";

export const TAX_PRESETS = [5, 12, 18, 22] as const;

export type ChargeInput = {
  kind: ChargeKind;
  label: string;
  frequency: ChargeFrequency;
  billCycle: string;
  amount: number;
  taxIncluded: boolean;
  taxPercent: number;
};

export type StoredCharge = ChargeInput & { id: number; billed: number };

export function frequencyLabel(value: string) {
  return value === "recurring" ? "Recurring" : "One-time";
}

const EMPTY_TAX = new Set(["", "null", "na", "n/a", "none", "included", "tax included", "incl", "inclusive", "0", "0%"]);

export function parseChargeTax(value: string): { ok: true; taxIncluded: boolean; taxPercent: number } | { ok: false } {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (EMPTY_TAX.has(key)) return { ok: true, taxIncluded: true, taxPercent: 0 };
  const match = key.match(/^(\d{1,3})\s*%?$/);
  if (!match) return { ok: false };
  const percent = Number(match[1]);
  if (percent > 100) return { ok: false };
  if (percent === 0) return { ok: true, taxIncluded: true, taxPercent: 0 };
  return { ok: true, taxIncluded: false, taxPercent: percent };
}

export function parseChargeFrequency(value: string): ChargeFrequency | "blank" | "invalid" {
  const key = value.trim().toLowerCase();
  if (!key || key === "null" || key === "na" || key === "n/a") return "blank";
  if (["once", "one-time", "one time", "onetime"].includes(key)) return "once";
  if (["recurring", "recur", "every", "monthly"].includes(key)) return "recurring";
  return "invalid";
}

export function blankChargeAmount(value: string) {
  const key = value.trim().toLowerCase();
  return !key || key === "null" || key === "na" || key === "n/a" || key === "none" || key === "-";
}

export function chargePayable(charge: {
  amount: number;
  taxIncluded?: boolean;
  taxPercent?: number;
  tax_included?: number;
  tax_percent?: number;
}) {
  const included = typeof charge.taxIncluded === "boolean" ? charge.taxIncluded : charge.tax_included !== 0;
  const percent = charge.taxPercent ?? charge.tax_percent ?? 0;
  if (included || percent <= 0) return charge.amount;
  return charge.amount + Math.round((charge.amount * percent) / 100);
}

export function chargeTaxAmount(charge: {
  amount: number;
  taxIncluded?: boolean;
  taxPercent?: number;
  tax_included?: number;
  tax_percent?: number;
}) {
  return chargePayable(charge) - charge.amount;
}

export function readCharges(formData: FormData): { ok: true; charges: ChargeInput[] } | { ok: false; error: string } {
  const kinds = formData.getAll("charge_kind").map(String);
  const labels = formData.getAll("charge_label").map((value) => String(value).trim());
  const frequencies = formData.getAll("charge_frequency").map(String);
  const amounts = formData.getAll("charge_amount").map(String);
  const taxes = formData.getAll("charge_tax").map(String);
  const customTaxes = formData.getAll("charge_tax_percent").map(String);
  if (kinds.length === 0) return { ok: true, charges: [] };
  if (kinds.length > 12) return { ok: false, error: "Add up to 12 charges." };
  if (
    kinds.length !== labels.length ||
    kinds.length !== frequencies.length ||
    kinds.length !== amounts.length ||
    kinds.length !== taxes.length ||
    kinds.length !== customTaxes.length
  ) {
    return { ok: false, error: "Each charge needs a type, a frequency, an amount, and a tax." };
  }

  const charges: ChargeInput[] = [];
  for (let i = 0; i < kinds.length; i += 1) {
    const known = CHARGE_KINDS.find((item) => item.value === kinds[i]);
    if (!known) return { ok: false, error: "Choose a charge from the list." };
    const picked = frequencies[i];
    const frequency = picked === "once" || picked === "recurring" ? picked : isBillCycle(picked) ? "recurring" : "";
    const billCycle = isBillCycle(picked) ? picked : "";
    if (!frequency) return { ok: false, error: "Choose a frequency for each charge." };
    const amount = Number(amounts[i]);
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Enter each charge in whole rupees." };
    const taxValue = taxes[i] === "custom" ? customTaxes[i] : taxes[i];
    const tax = parseChargeTax(taxValue);
    if (!tax.ok) return { ok: false, error: "Tax is a percent such as 18, or included when the amount already has tax." };
    const label = labels[i] || known.label;
    if (label.length < 2 || label.length > 40) {
      return { ok: false, error: "Name each charge in a few words." };
    }
    charges.push({
      kind: known.value,
      label,
      frequency,
      billCycle,
      amount,
      taxIncluded: tax.taxIncluded,
      taxPercent: tax.taxPercent,
    });
  }
  return { ok: true, charges };
}

export function openCharges<T extends { frequency: string; billed: number }>(charges: T[]) {
  return charges.filter((charge) => charge.frequency === "recurring" || (charge.frequency === "once" && !charge.billed));
}

export function chargesTotal(charges: { frequency: string; billed: number; amount: number; taxIncluded?: boolean; taxPercent?: number; tax_included?: number; tax_percent?: number }[]) {
  return openCharges(charges).reduce((sum, charge) => sum + chargePayable(charge), 0);
}

export function readBillTax(mode: string, percent: string) {
  if (mode === "custom") return parseChargeTax(percent);
  return parseChargeTax(mode);
}

export const DISCOUNT_TARGETS = [
  { value: "plan", label: "Plan" },
  { value: "router", label: "Router charge" },
  { value: "installation", label: "Installation charge" },
  { value: "service", label: "Service charge" },
  { value: "other", label: "Other charge" },
  { value: "invoice", label: "Full invoice" },
] as const;

export type DiscountTarget = (typeof DISCOUNT_TARGETS)[number]["value"];
export type DiscountMode = "amount" | "percent";

export type DiscountInput = {
  name: string;
  appliesTo: string;
  mode: DiscountMode;
  frequency: ChargeFrequency;
  value: number;
};

type BillCharge = {
  label: string;
  kind?: string;
  frequency: string;
  billed: number;
  amount: number;
  taxIncluded?: boolean;
  taxPercent?: number;
  tax_included?: number;
  tax_percent?: number;
  activated_on?: string;
};

export type BillDiscount = {
  name: string;
  appliesTo?: string;
  applies_to?: string;
  mode: string;
  value: number;
  frequency?: string;
  billed?: number;
};

export function serviceSpan(activated = "", renews = "") {
  const start = isDate(activated) ? formatDate(activated) : "";
  const end = isDate(renews) ? formatDate(renews) : "";
  if (start && end) return `${start} to ${end}`;
  if (start) return `activated ${start}`;
  if (end) return `renews ${end}`;
  return "";
}

function withSpan(label: string, activated?: string, renews?: string) {
  const span = serviceSpan(activated, renews);
  return span ? `${label}, ${span}` : label;
}

function discountTarget(discount: BillDiscount) {
  return discount.appliesTo ?? discount.applies_to ?? "";
}

function liveDiscounts(discounts: BillDiscount[]) {
  return discounts.filter((discount) => discount.frequency !== "once" || !discount.billed).map((discount) => ({
    name: discount.name,
    appliesTo: discountTarget(discount),
    mode: discount.mode === "percent" ? ("percent" as const) : ("amount" as const),
    value: discount.value,
    remaining: discount.value,
  }));
}

function takeDiscount(discount: ReturnType<typeof liveDiscounts>[number], base: number) {
  if (base <= 0 || discount.value <= 0) return 0;
  if (discount.mode === "percent") return Math.min(base, Math.round((base * discount.value) / 100));
  const off = Math.min(base, discount.remaining);
  discount.remaining -= off;
  return off;
}

function applyTargetDiscounts(
  lines: { description: string; amount: number }[],
  discounts: ReturnType<typeof liveDiscounts>,
  target: string | string[],
  base: number,
  label: string,
) {
  const targets = Array.isArray(target) ? target : [target];
  let left = base;
  for (const discount of discounts) {
    if (!targets.includes(discount.appliesTo)) continue;
    const off = takeDiscount(discount, left);
    if (off <= 0) continue;
    left -= off;
    lines.push({ description: `${discount.name} on ${label}`, amount: -off });
  }
  return left;
}

export type ExtraPlanBill = {
  planId?: number;
  planLine: string;
  planAmount: number;
  planTaxIncluded: boolean;
  planTaxPercent: number;
  activatedOn?: string;
  renewsOn?: string;
};

function pushPlanLine(
  lines: { description: string; amount: number }[],
  discounts: ReturnType<typeof liveDiscounts>,
  plan: { planId?: number; planLine: string; planAmount: number; planTaxIncluded: boolean; planTaxPercent: number; activatedOn?: string; renewsOn?: string },
  taxLabel: string,
) {
  if (plan.planAmount <= 0) return;
  lines.push({ description: withSpan(plan.planLine, plan.activatedOn, plan.renewsOn), amount: plan.planAmount });
  const targets = plan.planId ? ["plan", `plan:${plan.planId}`] : ["plan"];
  applyTargetDiscounts(lines, discounts, targets, plan.planAmount, taxLabel);
}

export function subscriberBill(input: {
  planLine: string;
  planAmount: number;
  planId?: number;
  planTaxIncluded: boolean;
  planTaxPercent: number;
  activatedOn?: string;
  renewsOn?: string;
  extraPlans?: ExtraPlanBill[];
  charges: BillCharge[];
  discounts?: BillDiscount[];
  invoiceTaxIncluded: boolean;
  invoiceTaxPercent: number;
  paid?: number;
}) {
  const lines: { description: string; amount: number }[] = [];
  const discounts = liveDiscounts(input.discounts ?? []);
  pushPlanLine(lines, discounts, input, input.planLine);
  for (const extra of input.extraPlans ?? []) {
    pushPlanLine(lines, discounts, extra, extra.planLine);
  }
  for (const charge of openCharges(input.charges)) {
    lines.push({ description: withSpan(charge.label, charge.activated_on), amount: charge.amount });
    applyTargetDiscounts(lines, discounts, charge.kind ?? "", charge.amount, charge.label);
  }
  let subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  for (const discount of discounts) {
    if (discount.appliesTo !== "invoice") continue;
    const off = takeDiscount(discount, Math.max(0, subtotal));
    if (off <= 0) continue;
    subtotal -= off;
    lines.push({ description: `${discount.name} on invoice`, amount: -off });
  }
  const tax = invoiceTotals(Math.max(0, subtotal), input.invoiceTaxIncluded, input.invoiceTaxPercent);
  const due = tax.grand;
  if (input.paid && input.paid > due) lines.push({ description: "Additional amount", amount: input.paid - due });
  return { lines, due, tax };
}

export function readDiscounts(formData: FormData): { ok: true; discounts: DiscountInput[] } | { ok: false; error: string } {
  const names = formData.getAll("discount_name").map((value) => String(value).trim());
  const targets = formData.getAll("discount_applies").map(String);
  const frequencies = formData.getAll("discount_frequency").map(String);
  const modes = formData.getAll("discount_mode").map(String);
  const values = formData.getAll("discount_value").map(String);
  if (names.length === 0) return { ok: true, discounts: [] };
  if (names.length > 12) return { ok: false, error: "Add up to 12 discounts." };
  if (names.length !== targets.length || names.length !== frequencies.length || names.length !== modes.length || names.length !== values.length) {
    return { ok: false, error: "Each discount needs a name, what it applies to, a frequency, a basis, and a value." };
  }
  const discounts: DiscountInput[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const known = DISCOUNT_TARGETS.find((item) => item.value === targets[i]);
    const planTarget = /^plan:\d+$/.test(targets[i]) ? targets[i] : "";
    if (!known && !planTarget) return { ok: false, error: "Choose what the discount applies to." };
    if (names[i].length < 2 || names[i].length > 40) return { ok: false, error: "Name each discount in a few words." };
    const frequency = frequencies[i] === "once" ? "once" : frequencies[i] === "recurring" ? "recurring" : "";
    if (!frequency) return { ok: false, error: "Choose whether each discount applies once or always with the plan." };
    const mode = modes[i] === "amount" ? "amount" : modes[i] === "percent" ? "percent" : null;
    if (!mode) return { ok: false, error: "Choose an amount or a percent for each discount." };
    const value = Number(values[i]);
    if (!Number.isInteger(value) || value <= 0) return { ok: false, error: "Enter each discount as a whole number." };
    if (mode === "percent" && value > 100) return { ok: false, error: "A percent discount cannot be more than 100." };
    discounts.push({ name: names[i], appliesTo: planTarget || known!.value, mode, frequency, value });
  }
  return { ok: true, discounts };
}

const DISCOUNT_IMPORT: Record<string, DiscountTarget> = {
  plan: "plan",
  router: "router",
  "router charge": "router",
  installation: "installation",
  "installation charge": "installation",
  "installation fee": "installation",
  service: "service",
  "service charge": "service",
  "service fee": "service",
  other: "other",
  "other charge": "other",
  invoice: "invoice",
  "full invoice": "invoice",
};

export function discountsFromImport(
  row: {
    discountName: string;
    discountApplies: string;
    discountMode: string;
    discountValue: string;
  },
  plans?: Map<string, number>,
): { ok: true; discounts: DiscountInput[] } | { ok: false; error: string } {
  const name = row.discountName.trim();
  const applies = row.discountApplies.trim();
  const modeText = row.discountMode.trim();
  const valueText = row.discountValue.trim();
  if (blankChargeAmount(name) && blankChargeAmount(applies) && blankChargeAmount(modeText) && blankChargeAmount(valueText)) {
    return { ok: true, discounts: [] };
  }
  if (blankChargeAmount(name) || name.length < 2 || name.length > 40) {
    return { ok: false, error: "Name the discount, or leave the whole discount blank." };
  }
  const known = DISCOUNT_IMPORT[applies.toLowerCase()];
  const planId = plans?.get(applies.toLowerCase());
  const appliesTo = known ?? (planId ? `plan:${planId}` : "");
  if (!appliesTo) return { ok: false, error: "Discount applies to an internet plan, router, installation, service, or the full invoice." };
    const modeKey = modeText.toLowerCase().replace(/\s+/g, "");
    const mode: DiscountMode | null = ["amount", "rupee", "rupees", "rs", "money", "monetary", "₹"].includes(modeKey)
      ? "amount"
      : ["percent", "percentage", "%", "%age", "pct"].includes(modeKey)
        ? "percent"
        : null;
  if (!mode) return { ok: false, error: "Discount basis is amount or percent." };
  const value = Number(valueText.replace(/[₹,%\s]/g, ""));
  if (!Number.isInteger(value) || value <= 0 || (mode === "percent" && value > 100)) {
    return { ok: false, error: "Discount value is a whole number of rupees, or a percent up to 100." };
  }
  return { ok: true, discounts: [{ name, appliesTo, mode, frequency: "recurring", value }] };
}

export function discountSummary(discount: BillDiscount) {
  const target = discountTarget(discount);
  const known = DISCOUNT_TARGETS.find((item) => item.value === target);
  const label = known?.label.toLowerCase() ?? (target.startsWith("plan:") ? "plan" : "the invoice");
  const value = discount.mode === "percent" ? `${discount.value}%` : formatInr(discount.value);
  const timing = discount.frequency === "once" ? ", once" : "";
  return `${discount.name} ${value} off ${label}${timing}`;
}

export type BillPerson = {
  price: number;
  bill_cycle: string;
  plan_id?: number;
  plan_amount?: number;
  plan_cycle?: string;
  plan_name: string;
  plan_frequency: string;
  plan_billed: number;
  plan_tax_included: number;
  plan_tax_percent: number;
  invoice_tax_included: number;
  invoice_tax_percent: number;
  installation_date?: string;
  renew_date?: string;
};

export type StoredExtraPlan = {
  plan_id?: number;
  plan_name: string;
  price: number;
  amount?: number;
  bill_cycle: string;
  tax_included: number;
  tax_percent: number;
  activated_on?: string;
  renews_on?: string;
};

export function invoiceFor(
  person: BillPerson,
  charges: Parameters<typeof subscriberBill>[0]["charges"],
  extra?: { planLine?: string; paid?: number; discounts?: BillDiscount[]; extraPlans?: StoredExtraPlan[] },
) {
  const planCycle = person.plan_cycle || person.bill_cycle;
  const planAmount = person.plan_frequency === "once" && person.plan_billed
    ? 0
    : person.plan_amount && person.plan_amount > 0
      ? person.plan_amount
      : cycleAmount(person.price, planCycle);
  return subscriberBill({
    planLine: extra?.planLine ?? person.plan_name,
    planAmount,
    planTaxIncluded: person.plan_tax_included !== 0,
    planTaxPercent: person.plan_tax_percent,
    planId: person.plan_id,
    activatedOn: person.installation_date,
    renewsOn: person.renew_date,
    extraPlans: (extra?.extraPlans ?? []).map((plan) => ({
      planId: plan.plan_id,
      planLine: plan.plan_name,
      planAmount: plan.amount && plan.amount > 0 ? plan.amount : cycleAmount(plan.price, plan.bill_cycle),
      planTaxIncluded: plan.tax_included !== 0,
      planTaxPercent: plan.tax_percent,
      activatedOn: plan.activated_on || person.installation_date,
      renewsOn: plan.renews_on || person.renew_date,
    })),
    charges: charges.map((charge) => ({
      ...charge,
      activated_on: charge.activated_on || person.installation_date,
    })),
    discounts: extra?.discounts,
    invoiceTaxIncluded: person.invoice_tax_included !== 0,
    invoiceTaxPercent: person.invoice_tax_percent,
    paid: extra?.paid,
  });
}

export type ExtraPlanInput = {
  planId: number;
  customName: string;
  billCycle: string;
  amount: number;
  taxIncluded: boolean;
  taxPercent: number;
};

export function readPlanLines(formData: FormData):
  | { ok: true; cycle: string; amount: number; customName: string; plans: ExtraPlanInput[] }
  | { ok: false; error: string } {
  const ids = formData.getAll("plan_id").map(String);
  const customNames = formData.getAll("plan_custom_name").map((value) => String(value).trim());
  const cycles = formData.getAll("plan_cycle").map(String);
  const amounts = formData.getAll("plan_amount").map(String);
  const taxes = formData.getAll("plan_tax").map(String);
  const percents = formData.getAll("plan_tax_percent").map(String);
  if (ids.length === 0) return { ok: false, error: "Choose an internet plan." };
  if (ids.length > 8) return { ok: false, error: "Add up to 8 plans." };
  if (
    ids.length !== customNames.length ||
    ids.length !== cycles.length ||
    ids.length !== amounts.length ||
    ids.length !== taxes.length ||
    ids.length !== percents.length
  ) {
    return { ok: false, error: "Each internet plan needs a frequency, an amount, and a tax." };
  }
  const parsed: ExtraPlanInput[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const custom = ids[i] === "__custom__";
    const planId = custom ? 0 : Number(ids[i]);
    if (!custom && (!Number.isInteger(planId) || planId <= 0)) return { ok: false, error: "Choose an internet plan on each line." };
    if (custom && (customNames[i].length < 2 || customNames[i].length > 40)) {
      return { ok: false, error: "Name each custom internet plan in a few words." };
    }
    if (!isBillCycle(cycles[i])) return { ok: false, error: "Choose a frequency on each internet plan." };
    const amount = Number(amounts[i]);
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Enter each internet plan amount in whole rupees." };
    const tax = readBillTax(taxes[i], percents[i]);
    if (!tax.ok) return { ok: false, error: "Plan tax is a percent, or included when the plan amount already has tax." };
    parsed.push({
      planId,
      customName: custom ? customNames[i] : "",
      billCycle: cycles[i],
      amount,
      taxIncluded: tax.taxIncluded,
      taxPercent: tax.taxPercent,
    });
  }
  const [primary, ...plans] = parsed;
  return { ok: true, cycle: primary.billCycle, amount: primary.amount, customName: primary.customName, plans };
}

export function readBillSettings(formData: FormData):
  | {
      ok: true;
      planFrequency: ChargeFrequency;
      planTaxIncluded: boolean;
      planTaxPercent: number;
      invoiceTaxIncluded: boolean;
      invoiceTaxPercent: number;
    }
  | { ok: false; error: string } {
  const frequency = String(formData.get("plan_frequency") ?? "recurring");
  if (frequency !== "once" && frequency !== "recurring") {
    return { ok: false, error: "Choose one-time or recurring for the plan." };
  }
  const planTax = readBillTax(String(formData.get("plan_tax") ?? "included"), String(formData.get("plan_tax_percent") ?? ""));
  if (!planTax.ok) return { ok: false, error: "Plan tax is a percent, or included when the plan amount already has tax." };
  const invoiceTax = readBillTax(String(formData.get("invoice_tax") ?? "included"), String(formData.get("invoice_tax_percent") ?? ""));
  if (!invoiceTax.ok) {
    return { ok: false, error: "Invoice tax is a percent, or included when nothing extra should be added to the invoice." };
  }
  return {
    ok: true,
    planFrequency: frequency,
    planTaxIncluded: planTax.taxIncluded,
    planTaxPercent: planTax.taxPercent,
    invoiceTaxIncluded: invoiceTax.taxIncluded,
    invoiceTaxPercent: invoiceTax.taxIncluded ? 18 : invoiceTax.taxPercent,
  };
}

function gstPair(percent: number) {
  const rate = percent > 0 ? percent : 18;
  return `CGST ${rate / 2}% and SGST ${rate / 2}%`;
}

export function billTaxNote(person: Pick<BillPerson, "plan_tax_included" | "plan_tax_percent" | "invoice_tax_included" | "invoice_tax_percent">) {
  const bits: string[] = [];
  if (person.invoice_tax_included === 0) bits.push(`Tax is added on the invoice total as ${gstPair(person.invoice_tax_percent)}.`);
  else bits.push(`Tax is inside the invoice total as ${gstPair(person.invoice_tax_percent)}.`);
  if (bits.length === 0) return "";
  return ` ${bits.join(" ")}`;
}

export function chargeSummary(charge: {
  label: string;
  frequency: string;
  billCycle?: string;
  bill_cycle?: string;
  amount: number;
  taxIncluded?: boolean;
  taxPercent?: number;
  tax_included?: number;
  tax_percent?: number;
}) {
  const included = typeof charge.taxIncluded === "boolean" ? charge.taxIncluded : charge.tax_included !== 0;
  const percent = charge.taxPercent ?? charge.tax_percent ?? 0;
  const tax = included || percent <= 0 ? "tax included" : `${percent}% tax added`;
  const cycle = charge.billCycle || charge.bill_cycle || "";
  const timing = charge.frequency === "once" || !cycle ? frequencyLabel(charge.frequency).toLowerCase() : billCycleLabel(cycle).toLowerCase();
  return `${charge.label} ${formatInr(chargePayable(charge))} (${timing}, ${tax})`;
}

export type ImportChargeFields = {
  routerAmount: string;
  routerFrequency: string;
  routerTax: string;
  installationAmount: string;
  installationFrequency: string;
  installationTax: string;
  serviceAmount: string;
  serviceFrequency: string;
  serviceTax: string;
  otherCharge: string;
  otherAmount: string;
  otherFrequency: string;
  otherTax: string;
};

export function chargesFromImport(row: ImportChargeFields): { ok: true; charges: ChargeInput[] } | { ok: false; error: string } {
  const slots: { kind: ChargeKind; label: string; amount: string; frequency: string; tax: string }[] = [
    { kind: "router", label: "Router charge", amount: row.routerAmount, frequency: row.routerFrequency, tax: row.routerTax },
    { kind: "installation", label: "Installation charge", amount: row.installationAmount, frequency: row.installationFrequency, tax: row.installationTax },
    { kind: "service", label: "Service charge", amount: row.serviceAmount, frequency: row.serviceFrequency, tax: row.serviceTax },
    { kind: "other", label: row.otherCharge.trim(), amount: row.otherAmount, frequency: row.otherFrequency, tax: row.otherTax },
  ];
  const charges: ChargeInput[] = [];
  for (const slot of slots) {
    const unnamed = slot.kind === "other" && blankChargeAmount(slot.label);
    if (blankChargeAmount(slot.amount) && blankChargeAmount(slot.frequency) && blankChargeAmount(slot.tax) && unnamed) continue;
    if (blankChargeAmount(slot.amount)) {
      return { ok: false, error: `${slot.kind === "other" ? "Other charge" : slot.label} needs an amount, or leave the whole charge blank.` };
    }
    const amount = Number(slot.amount.replace(/[₹,\s]/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, error: "Charge amounts are whole rupees. Leave a charge blank, NULL, or NA to skip it." };
    }
    const frequency = parseChargeFrequency(slot.frequency);
    if (frequency === "invalid") return { ok: false, error: "Charge frequency is one-time or recurring. Leave it blank for one-time." };
    const tax = parseChargeTax(slot.tax);
    if (!tax.ok) return { ok: false, error: "Charge tax is a percent such as 18, or included, blank, NULL, or NA." };
    if (slot.kind === "other" && slot.label && (slot.label.length < 2 || slot.label.length > 40)) {
      return { ok: false, error: "Name the other charge, or leave it blank." };
    }
    charges.push({
      kind: slot.kind,
      label: slot.kind === "other" ? slot.label || "Other charge" : slot.label,
      frequency: frequency === "blank" ? "once" : frequency,
      billCycle: "",
      amount,
      taxIncluded: tax.taxIncluded,
      taxPercent: tax.taxPercent,
    });
  }
  return { ok: true, charges };
}
