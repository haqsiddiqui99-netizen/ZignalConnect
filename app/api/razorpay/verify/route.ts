import { getSession } from "@/lib/auth";
import { checkoutSignatureValid, settleUpgradePayment } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.kind !== "desk" || session.role !== "admin") return fail("Sign in again to confirm this payment.", 401);

  const body = (await request.json().catch(() => ({}))) as {
    orderId?: unknown;
    razorpay_order_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
  };
  const gatewayOrder = String(body.razorpay_order_id ?? "");
  const payment = String(body.razorpay_payment_id ?? "");
  const signature = String(body.razorpay_signature ?? "");
  if (!checkoutSignatureValid(gatewayOrder, payment, signature)) {
    return fail("The payment could not be verified. If money was taken, the plan will update once Razorpay confirms it.", 400);
  }

  const settled = await settleUpgradePayment(payment);
  if (!settled.ok) return fail(settled.error, 409);
  if (settled.order.provider_id !== session.providerId || settled.order.id !== Number(body.orderId)) {
    return fail("This payment belongs to another order.", 403);
  }
  return Response.json({ ok: true });
}
