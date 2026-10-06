import Link from "next/link";
import { notFound } from "next/navigation";
import { applyUpgradePromo, clearUpgradePromo, payUpgrade } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { AddPromo } from "@/components/add-promo";
import { PayMethods } from "@/components/pay-methods";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { orderPayable, type UpgradeOrder } from "@/lib/checkout";
import { one } from "@/lib/db";
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
  const notice =
    query.notice === "gateway"
      ? "The payment gateway is not connected yet. Nothing was charged, and this desk stays on its current plan."
      : query.notice;

  return (
    <>
      <p>
        <Link className="back" href={`/provider/upgrade/pay/${order.id}`}>
          Order
        </Link>
      </p>
      <header className="page-head pay-page-head">
        <div>
          <h1>Pay {order.plan_label}</h1>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card pay-card">
        <header className="pay-hero">
          <span className="pay-kicker">Amount due</span>
          <p className="pay-amount">{formatInr(payable)}</p>
          <p className="pay-sub">
            {order.plan_label} · up to {limitLabel(plan.customers)} subscribers
          </p>
          {order.promo_off ? (
            <div className="pay-chip">
              <span>
                {order.promo_code} takes {formatInr(order.promo_off)} off {formatInr(order.total)}
              </span>
              {session.isOwner ? (
                <form action={clearUpgradePromo}>
                  <input type="hidden" name="order_id" value={order.id} />
                  <button className="promo-clear" type="submit">
                    Remove
                  </button>
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
              Choose how this plan payment should be collected. Nothing is taken from a card or UPI account until the payment gateway is connected, and the plan stays as it is.
            </p>
            <form action={payUpgrade} className="pay-form">
              <input type="hidden" name="order_id" value={order.id} />
              <PayMethods />
              <AddPromo code={order.promo_code || ""} action={applyUpgradePromo} />
              <SubmitButton className="btn primary pay-submit" pendingLabel="Contacting the gateway…">
                Pay {formatInr(payable)}
              </SubmitButton>
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
