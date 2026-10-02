import { run, one } from "@/lib/db";
import { nowStamp } from "@/lib/format";
import type { ProductPlan } from "@/lib/entitlements";

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

export function markUpgradePaid(orderId: number) {
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", orderId);
  if (!order || order.status === "paid") return order ?? null;
  run(
    "UPDATE providers SET product_plan = ?, subscriber_base = ? WHERE id = ?",
    order.product_plan,
    order.subscriber_base,
    order.provider_id,
  );
  run("UPDATE upgrade_orders SET status = 'paid', paid_at = ? WHERE id = ?", nowStamp(), orderId);
  return one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", orderId) ?? null;
}
