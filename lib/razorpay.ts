import crypto from "crypto";
import { markUpgradePaid, orderPayable, type UpgradeOrder } from "@/lib/checkout";
import { one, run } from "@/lib/db";

const API = "https://api.razorpay.com/v1";

function setting(name: string) {
  const value = (process.env as Record<string, string | undefined>)[name];
  return typeof value === "string" ? value.trim() : "";
}

export function razorpayKeyId() {
  return setting("RAZORPAY_KEY_ID");
}

export function razorpayConfigured() {
  return Boolean(setting("RAZORPAY_KEY_ID") && setting("RAZORPAY_KEY_SECRET"));
}

function authHeader() {
  const token = Buffer.from(`${setting("RAZORPAY_KEY_ID")}:${setting("RAZORPAY_KEY_SECRET")}`).toString("base64");
  return `Basic ${token}`;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hmac(secret: string, body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/** Check the signature Razorpay Checkout hands the browser after a payment. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string) {
  const secret = setting("RAZORPAY_KEY_SECRET");
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(secret, `${orderId}|${paymentId}`), signature);
}

/** Check the X-Razorpay-Signature header on a webhook, using the raw request body. */
export function webhookSignatureValid(rawBody: string, signature: string) {
  const secret = setting("RAZORPAY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}

async function call<T>(path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!response.ok) {
    const reason = data.error?.description ?? `status ${response.status}`;
    console.error(`razorpay ${path} failed: ${reason}`);
    throw new Error(reason);
  }
  return data;
}

type RazorpayOrder = { id: string; amount: number; currency: string };

/** Create a Razorpay order for what this upgrade order still owes, and remember its id. */
export async function createGatewayOrder(order: UpgradeOrder) {
  const payable = orderPayable(order);
  if (payable <= 0) throw new Error("Nothing to pay on this order.");
  const created = await call<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: payable * 100,
      currency: "INR",
      receipt: `upgrade-${order.id}`,
      notes: { upgrade_order_id: String(order.id), provider_id: String(order.provider_id), plan: order.plan_label },
    },
  });
  run("UPDATE upgrade_orders SET gateway_order_id = ? WHERE id = ?", created.id, order.id);
  return { gatewayOrderId: created.id, amount: created.amount, currency: created.currency };
}

type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  notes?: Record<string, string> | unknown[];
};

export type SettleResult = { ok: true; order: UpgradeOrder; already: boolean } | { ok: false; error: string };

/**
 * Settle an upgrade order from a Razorpay payment id.
 * The payment is always read back from Razorpay, so neither the browser nor a webhook body is trusted for the amount or status.
 * Safe to call more than once for the same payment.
 */
export async function settleUpgradePayment(paymentId: string): Promise<SettleResult> {
  if (!razorpayConfigured()) return { ok: false, error: "The payment gateway is not connected." };
  let payment: RazorpayPayment;
  try {
    payment = await call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  } catch {
    return { ok: false, error: "The payment could not be confirmed with Razorpay." };
  }
  const notes = payment.notes && !Array.isArray(payment.notes) ? payment.notes : {};
  let orderId = Number(notes.upgrade_order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    const byGateway = payment.order_id
      ? one<{ id: number }>("SELECT id FROM upgrade_orders WHERE gateway_order_id = ?", payment.order_id)
      : undefined;
    orderId = byGateway?.id ?? 0;
  }
  const order = orderId > 0 ? one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", orderId) : undefined;
  if (!order) return { ok: false, error: "This payment does not belong to a plan order." };
  if (order.status === "paid") return { ok: true, order, already: true };

  if (payment.status === "authorized") {
    try {
      payment = await call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: "POST",
        body: { amount: payment.amount, currency: payment.currency },
      });
    } catch {
      return { ok: false, error: "The payment was authorised but could not be captured yet." };
    }
  }
  if (payment.status !== "captured") return { ok: false, error: "The payment was not completed." };
  if (payment.currency !== "INR" || payment.amount < orderPayable(order) * 100) {
    console.error(`razorpay payment ${payment.id} is short for upgrade order ${order.id}`);
    return { ok: false, error: "The amount paid is less than the amount due. Please contact Zignal support." };
  }
  const paid = markUpgradePaid(order.id);
  if (!paid) return { ok: false, error: "That payment was not found." };
  run("UPDATE upgrade_orders SET gateway_payment_id = ? WHERE id = ? AND gateway_payment_id = ''", payment.id, order.id);
  return { ok: true, order: paid, already: false };
}
