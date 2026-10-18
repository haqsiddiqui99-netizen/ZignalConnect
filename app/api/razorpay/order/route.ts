import { getSession } from "@/lib/auth";
import { orderPayable, type UpgradeOrder } from "@/lib/checkout";
import { one } from "@/lib/db";
import { createGatewayOrder, razorpayConfigured, razorpayKeyId } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.kind !== "desk" || session.role !== "admin" || !session.isOwner) {
    return fail("Only the desk owner can pay for a plan.", 403);
  }
  if (!razorpayConfigured()) return fail("The payment gateway is not connected yet. Nothing was charged.", 503);

  const body = (await request.json().catch(() => ({}))) as { orderId?: unknown };
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", Number(body.orderId));
  if (!order || order.provider_id !== session.providerId) return fail("That payment was not found.", 404);
  if (order.status === "paid") return fail("This payment is already recorded.", 409);
  if (orderPayable(order) <= 0) return fail("Nothing is due on this payment.", 409);

  try {
    const created = await createGatewayOrder(order);
    return Response.json({
      ok: true,
      keyId: razorpayKeyId(),
      gatewayOrderId: created.gatewayOrderId,
      amount: created.amount,
      currency: created.currency,
      name: "Zignal Connect",
      description: order.plan_label,
      prefill: { name: session.name, email: session.email },
    });
  } catch {
    return fail("Razorpay could not start this payment. Nothing was charged. Please try again.", 502);
  }
}
