import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { Banner } from "@/components/ui";
import type { UpgradeOrder } from "@/lib/checkout";
import { one } from "@/lib/db";
import { CATALOG, limitLabel, planFamily } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { getPlatformProfile } from "@/lib/queries";

export const metadata = { title: "Plan payment" };

export default async function UpgradePaymentPage({
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
  const platform = getPlatformProfile();
  const notice =
    query.notice === "gateway"
      ? "The payment gateway is not connected yet. Nothing was charged, and this desk stays on its current plan."
      : query.notice;

  return (
    <>
      <p>
        <Link className="back" href="/provider/upgrade">
          Desk plan
        </Link>
      </p>
      <header className="page-head">
        <div>
          <h1>Pay for {order.plan_label}</h1>
          <p>
            {planFamily(order.product_plan) === "premium"
              ? `Premium for a book of ${limitLabel(order.subscriber_base)}, held up to ${limitLabel(plan.customers)} subscribers.`
              : `${plan.label} for up to ${limitLabel(plan.customers)} subscribers.`}
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card" style={{ maxWidth: 640 }}>
        <p className="fine">Payable to {platform.legal_name}</p>
        <p className="hero-price" style={{ color: "var(--ink)", fontSize: 42 }}>
          {formatInr(order.total)}
        </p>
        <p className="fine" style={{ marginBottom: 16 }}>
          {formatInr(order.plan_amount)} plan
          {order.tax > 0 ? ` · GST ${formatInr(order.tax)}` : " · GST not charged"}
          {" · "}per month
        </p>
        <dl className="facts">
          <dt>Plan</dt>
          <dd>{order.plan_label}</dd>
          <dt>Subscribers</dt>
          <dd>Up to {limitLabel(plan.customers)}</dd>
          <dt>Status</dt>
          <dd>{order.status === "paid" ? "Paid" : "Waiting for payment"}</dd>
        </dl>
        {order.status === "paid" ? (
          <p style={{ marginTop: 16 }}>This payment is recorded and the desk is on {order.plan_label}.</p>
        ) : session.isOwner ? (
          <p style={{ marginTop: 16 }}>
            <Link className="btn primary" href={`/provider/upgrade/pay/${order.id}/checkout`}>
              Pay {formatInr(order.total)}
            </Link>
          </p>
        ) : (
          <p className="fine" style={{ marginTop: 16 }}>
            Only the owner can pay for a plan.
          </p>
        )}
      </article>
    </>
  );
}
