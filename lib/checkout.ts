import { run, one } from "@/lib/db";
import { nowStamp } from "@/lib/format";
import type { BillTerm, ProductPlan } from "@/lib/entitlements";

export type UpgradeOrder = {
  id: number;
  provider_id: number;
  product_plan: ProductPlan;
  subscriber_base: number;
  plan_label: string;
  plan_amount: number;
  tax: number;
  total: number;
  gst_mode: "none" | "cgst" | "igst";
  status: "pending" | "paid";
  created_at: string;
  paid_at: string;
  billing_term: BillTerm;
};

export type CheckoutResult = { ok: false; reason: "gateway_required" } | { ok: true };

/**
 * Charge a saved upgrade order.
 * This is the only function a payment gateway should replace.
 * On a confirmed charge, call markUpgradePaid. Do not change the plan from the gateway itself.
 */
export function collectUpgradePayment(
  _orderId: number,
  _payment: { method: string; detail: string },
): CheckoutResult {
  return { ok: false, reason: "gateway_required" };
}

/**
 * Charge a subscriber bill.
 * This is the only function a subscriber payment gateway should replace.
 * On a confirmed charge, the caller records the payment and the receipt.
 * Do not insert a payment or advance the renewal from the gateway itself.
 */
export function collectSubscriberPayment(
  _customerId: number,
  _payment: { method: string; detail: string; amount: number },
): CheckoutResult {
  return { ok: false, reason: "gateway_required" };
}

export function markUpgradePaid(orderId: number) {
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", orderId);
  if (!order || order.status === "paid") return order ?? null;
  run(
    "UPDATE providers SET product_plan = ?, subscriber_base = ?, billing_term = ? WHERE id = ?",
    order.product_plan,
    order.subscriber_base,
    order.billing_term || "monthly",
    order.provider_id,
  );
  run("UPDATE upgrade_orders SET status = 'paid', paid_at = ? WHERE id = ?", nowStamp(), orderId);
  return one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", orderId) ?? null;
}
