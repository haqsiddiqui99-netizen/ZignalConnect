export type ProductPlan =
  | "pro"
  | "ultra"
  | "premium_3000"
  | "premium_5000"
  | "premium_10000"
  | "premium_20000"
  | "premium_30000";

export type PlanFamily = "pro" | "ultra" | "premium";

export type Feature = "customBrand" | "logo" | "emailReminders" | "reports" | "sms" | "onlinePay" | "areas" | "renewalReminders";

export const OVERAGE_RATE = 3;
export const EXTRA_MESSAGE_RATE = 0.5;

export const CATALOG: Record<
  ProductPlan,
  { label: string; price: number; customers: number; reminders: number; staff: number; trialDays: number; blurb: string }
> = {
  pro: {
    label: "Pro",
    price: 1499,
    customers: 500,
    reminders: 1500,
    staff: 8,
    trialDays: 30,
    blurb: "A 30-day trial for a book of up to 500 subscribers.",
  },
  ultra: {
    label: "Ultra",
    price: 3999,
    customers: 1000,
    reminders: 3000,
    staff: 20,
    trialDays: 20,
    blurb: "A 20-day trial for a book of up to 1,000 subscribers.",
  },
  premium_3000: {
    label: "Premium 3,000",
    price: 7999,
    customers: 3000,
    reminders: 9000,
    staff: Number.POSITIVE_INFINITY,
    trialDays: 10,
    blurb: "A 10-day trial for a book of up to 3,000 subscribers.",
  },
  premium_5000: {
    label: "Premium 5,000",
    price: 12999,
    customers: 5000,
    reminders: 15000,
    staff: Number.POSITIVE_INFINITY,
    trialDays: 10,
    blurb: "A 10-day trial for a book of up to 5,000 subscribers.",
  },
  premium_10000: {
    label: "Premium 10,000",
    price: 24999,
    customers: 10000,
    reminders: 30000,
    staff: Number.POSITIVE_INFINITY,
    trialDays: 10,
    blurb: "A 10-day trial for a book of up to 10,000 subscribers.",
  },
  premium_20000: {
    label: "Premium 20,000",
    price: 44999,
    customers: 20000,
    reminders: 60000,
    staff: Number.POSITIVE_INFINITY,
    trialDays: 10,
    blurb: "A 10-day trial for a book of up to 20,000 subscribers.",
  },
  premium_30000: {
    label: "Premium 30,000",
    price: 64999,
    customers: 30000,
    reminders: 90000,
    staff: Number.POSITIVE_INFINITY,
    trialDays: 10,
    blurb: "A 10-day trial for a book of up to 30,000 subscribers.",
  },
};

export const PLAN_ORDER = Object.keys(CATALOG) as ProductPlan[];

export const PLAN_POINTS: { label: string; plans: PlanFamily[] }[] = [
  { label: "Subscriber desk, plans, and manual payments", plans: ["pro", "ultra", "premium"] },
  { label: "Subscribers raise connectivity complaints online", plans: ["pro", "ultra", "premium"] },
  { label: "Import customers from a spreadsheet", plans: ["pro", "ultra", "premium"] },
  { label: "Your ISP name on the subscriber portal", plans: ["pro", "ultra", "premium"] },
  { label: "Renewal reminders at 3 days, 1 day, and the due date", plans: ["pro", "ultra", "premium"] },
  { label: "Email renewal reminders", plans: ["pro", "ultra", "premium"] },
  { label: "Collection report and export", plans: ["pro", "ultra", "premium"] },
  { label: "8 staff logins", plans: ["pro"] },
  { label: "20 staff logins", plans: ["ultra"] },
  { label: "Unlimited staff", plans: ["premium"] },
  { label: "Logo on the portal", plans: ["ultra", "premium"] },
  { label: "SMS and WhatsApp reminders", plans: ["ultra", "premium"] },
  { label: "Subscribers pay renewal online", plans: ["ultra", "premium"] },
  { label: "Areas or branches", plans: ["ultra", "premium"] },
  { label: "10% subscriber overflow at ₹3 each", plans: ["pro", "ultra", "premium"] },
];

const FEATURES: Record<Feature, PlanFamily[]> = {
  customBrand: ["pro", "ultra", "premium"],
  logo: ["ultra", "premium"],
  emailReminders: ["pro", "ultra", "premium"],
  reports: ["pro", "ultra", "premium"],
  sms: ["ultra", "premium"],
  onlinePay: ["ultra", "premium"],
  areas: ["ultra", "premium"],
  renewalReminders: ["pro", "ultra", "premium"],
};

export function isProductPlan(value: string): value is ProductPlan {
  return PLAN_ORDER.includes(value as ProductPlan);
}

export function planFamily(plan: ProductPlan): PlanFamily {
  if (plan === "pro" || plan === "ultra") return plan;
  return "premium";
}

export function allows(plan: ProductPlan, feature: Feature) {
  return FEATURES[feature].includes(planFamily(plan));
}

export function customerLimit(plan: ProductPlan) {
  return CATALOG[plan].customers;
}

export function overflowLimit(plan: ProductPlan) {
  return Math.floor(CATALOG[plan].customers * 1.1);
}

export function staffLimit(plan: ProductPlan) {
  return CATALOG[plan].staff;
}

export function limitLabel(limit: number) {
  return Number.isFinite(limit) ? new Intl.NumberFormat("en-IN").format(limit) : "Unlimited";
}

export function planFitsBase(plan: ProductPlan, base: number) {
  return Number.isInteger(base) && base >= 1 && base <= CATALOG[plan].customers;
}

export function minimumPlan(base: number): ProductPlan {
  return PLAN_ORDER.find((plan) => base <= CATALOG[plan].customers) ?? "premium_30000";
}

export const PREMIUM_PLANS = PLAN_ORDER.filter((plan) => planFamily(plan) === "premium");

export function quotePremium(base: number):
  | { ok: true; plan: ProductPlan }
  | { ok: false; custom?: boolean; error: string } {
  if (!Number.isInteger(base) || base < 1) {
    return { ok: false, error: "Enter the subscriber base as a whole number." };
  }
  const ceiling = CATALOG.premium_30000.customers;
  if (base > ceiling) {
    return {
      ok: false,
      custom: true,
      error: `A book above ${limitLabel(ceiling)} subscribers is a custom offer.`,
    };
  }
  const plan = PREMIUM_PLANS.find((item) => base <= CATALOG[item].customers);
  if (!plan) {
    return { ok: false, custom: true, error: `A book above ${limitLabel(ceiling)} subscribers is a custom offer.` };
  }
  return { ok: true, plan };
}

export function portalBrand(plan: ProductPlan, ispName: string, logoLetter: string) {
  const letter = logoLetter.trim().slice(0, 2).toUpperCase();
  const mark = allows(plan, "logo") && letter ? letter : ispName.trim().slice(0, 1).toUpperCase() || "Z";
  return { title: ispName.trim().toUpperCase() || "ZIGNAL", mark };
}
