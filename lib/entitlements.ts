export type ProductPlan = "free" | "pro" | "ultra" | "premium";

export type Feature = "customBrand" | "logo" | "emailReminders" | "reports" | "sms" | "onlinePay" | "areas" | "renewalReminders";

export const CATALOG: Record<
  ProductPlan,
  { label: string; price: number; customers: number; staff: number; blurb: string }
> = {
  free: {
    label: "Free",
    price: 0,
    customers: 10,
    staff: 1,
    blurb: "A working desk for a small book of customers.",
  },
  pro: {
    label: "Pro",
    price: 1499,
    customers: 500,
    staff: 8,
    blurb: "Your ISP name on the portal, renewal reminders, and a collection report.",
  },
  ultra: {
    label: "Ultra",
    price: 3999,
    customers: 1000,
    staff: 20,
    blurb: "Online renewal, SMS and WhatsApp reminders, a logo, and areas.",
  },
  premium: {
    label: "Premium",
    price: 7999,
    customers: Number.POSITIVE_INFINITY,
    staff: Number.POSITIVE_INFINITY,
    blurb: "No customer cap, and every Ultra feature.",
  },
};

const FEATURES: Record<Feature, ProductPlan[]> = {
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
  return value === "free" || value === "pro" || value === "ultra" || value === "premium";
}

export function allows(plan: ProductPlan, feature: Feature) {
  return FEATURES[feature].includes(plan);
}

export function customerLimit(plan: ProductPlan) {
  return CATALOG[plan].customers;
}

export function staffLimit(plan: ProductPlan) {
  return CATALOG[plan].staff;
}

export function limitLabel(limit: number) {
  return Number.isFinite(limit) ? String(limit) : "Unlimited";
}

export function portalBrand(plan: ProductPlan, ispName: string, logoLetter: string) {
  if (!allows(plan, "customBrand")) return { title: "ZIGNAL", mark: "Z" };
  const letter = logoLetter.trim().slice(0, 2).toUpperCase();
  const mark = allows(plan, "logo") && letter ? letter : ispName.trim().slice(0, 1).toUpperCase() || "Z";
  return { title: ispName.trim().toUpperCase() || "ZIGNAL", mark };
}
