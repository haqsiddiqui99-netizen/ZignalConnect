import Link from "next/link";
import { notFound } from "next/navigation";
import { applyUpgradePromo, clearUpgradePromo, payUpgrade } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { AddPromo } from "@/components/add-promo";
import { RazorpayPay } from "@/components/razorpay-pay";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { orderPayable, type UpgradeOrder } from "@/lib/checkout";
import { one } from "@/lib/db";
import { razorpayConfigured } from "@/lib/razorpay";
import { CATALOG, limitLabel } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";

export const metadata = { title: "Pay" };

export default async function UpgradeCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", Number(id));
  if (!order || order.provider_id !== session.providerId) notFound();
  const plan = CATALOG[order.product_plan];
  const payable = orderPayable(order);
  const notice = query.notice;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="head-line">
            <Link className="btn small" href={`/provider/upgrade/pay/${order.id}`}>
              ← Plan payment
            </Link>
            <h1>Pay {order.plan_label}</h1>
          </div>
          <p>Pay securely with Razorpay. The plan stays as it is until the payment is confirmed.</p>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card pay-card">
        <header className="pay-hero">
          <span className="pay-kicker">Amount due</span>
          <p className="pay-amount">{formatInr(payable)}</p>
          <p className="pay-sub">
            {formatInr(order.plan_amount)} plan
            {order.tax > 0 ? ` · GST ${formatInr(order.tax)} on top` : " · + GST applicable"}
            {" · "}
            up to {limitLabel(plan.customers)} subscribers
          </p>
          {order.promo_off ? (
            <div className="pay-chip">
              <span>
                {order.promo_code} takes {formatInr(order.promo_off)} off {formatInr(order.total)}
              </span>
              {session.isOwner ? (
                <form action={clearUpgradePromo}>
                  <input type="hidden" name="order_id" value={order.id} />
                  <SubmitButton className="promo-clear" pendingLabel="Removing…">
                    Remove
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ) : null}
        </header>
        {order.status === "paid" ? (
          <div className="pay-body">
            <p className="pay-note">This payment is already recorded.</p>
          </div>
        ) : session.isOwner ? (
          <div className="pay-body">
            <p className="pay-note">
              {payable > 0
                ? "Pay with UPI, card, net banking or wallet in the secure Razorpay window. Your plan updates as soon as the payment is confirmed."
                : "This payment is fully covered by the promo. Confirm to move the desk onto the plan."}
            </p>
            <form action={payable > 0 ? applyUpgradePromo : payUpgrade} className="pay-form">
              <input type="hidden" name="order_id" value={order.id} />
              <AddPromo code={order.promo_code || ""} action={applyUpgradePromo} />
              {payable > 0 ? (
                <RazorpayPay
                  orderId={order.id}
                  amountLabel={formatInr(payable)}
                  ready={razorpayConfigured()}
                  doneHref="/provider/upgrade?notice=Plan%20updated."
                />
              ) : (
                <SubmitButton className="btn primary pay-submit" pendingLabel="Updating the plan…">
                  Confirm the plan
                </SubmitButton>
              )}
            </form>
          </div>
        ) : (
          <div className="pay-body">
            <p className="pay-note">Only the owner can pay for a plan.</p>
          </div>
        )}
      </article>
    </>
  );
}
