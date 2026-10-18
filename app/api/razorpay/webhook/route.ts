import { settleUpgradePayment, webhookSignatureValid } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

type WebhookEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string } } };
};

/**
 * Razorpay calls this when a payment is captured, even if the owner closed the tab mid-payment.
 * Set the webhook URL to https://<site>/api/razorpay/webhook with the events payment.captured and order.paid.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get("x-razorpay-signature") ?? "")) {
    return new Response("Invalid signature", { status: 400 });
  }
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") return new Response("Ignored", { status: 200 });

  const paymentId = event.payload?.payment?.entity?.id;
  if (!paymentId) return new Response("Ignored", { status: 200 });

  const settled = await settleUpgradePayment(paymentId);
  // A payment that is not for a plan order (or is short) will never succeed on retry, so answer 200 and stop Razorpay retrying.
  // A temporary failure to reach Razorpay returns 500 so Razorpay retries later.
  if (!settled.ok && settled.error.includes("could not be confirmed")) return new Response("Retry", { status: 500 });
  return new Response("OK", { status: 200 });
}
