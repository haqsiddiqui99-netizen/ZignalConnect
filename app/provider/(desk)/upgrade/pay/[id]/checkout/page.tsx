import Link from "next/link";
import { notFound } from "next/navigation";
import { payUpgrade } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PayMethods } from "@/components/pay-methods";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import type { UpgradeOrder } from "@/lib/checkout";
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
      <header className="page-head">
        <div>
          <h1>Pay {order.plan_label}</h1>
          <p>Up to {limitLabel(plan.customers)} subscribers · {formatInr(order.total)} per month</p>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card" style={{ maxWidth: 640 }}>
        <p className="hero-price" style={{ color: "var(--ink)" }}>
          {formatInr(order.total)}
        </p>
        {order.status === "paid" ? (
          <p style={{ marginTop: 12 }}>This payment is already recorded.</p>
        ) : session.isOwner ? (
          <>
            <p className="fine" style={{ margin: "8px 0 16px" }}>
              Choose how this plan payment should be collected. The payment gateway completes the charge. Until it is
              connected, nothing is taken from a card or UPI account and the plan stays as it is.
            </p>
            <form action={payUpgrade} className="stack">
              <input type="hidden" name="order_id" value={order.id} />
              <PayMethods />
              <SubmitButton pendingLabel="Contacting the gateway…">Pay {formatInr(order.total)}</SubmitButton>
            </form>
          </>
        ) : (
          <p className="fine" style={{ marginTop: 12 }}>
            Only the owner can pay for a plan.
          </p>
        )}
      </article>
    </>
  );
}
