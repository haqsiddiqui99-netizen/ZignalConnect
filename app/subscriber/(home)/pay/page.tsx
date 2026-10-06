import Link from "next/link";
import { notFound } from "next/navigation";
import { applySubscriberPromo, payBill } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { AddPromo } from "@/components/add-promo";
import { PayMethods } from "@/components/pay-methods";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { promoOff } from "@/lib/checkout";
import { allows } from "@/lib/entitlements";
import { billCycleAdvance, billCycleLabel, nextRenewalDate } from "@/lib/bill-cycle";
import { billTaxNote, chargeSummary, discountSummary, invoiceFor, openCharges } from "@/lib/charges";
import { formatDate, formatInr, formatSpeed, todayISO } from "@/lib/format";
import { findCataloguePromo, getSubscriberByUserId, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";

export const metadata = { title: "Pay bill" };

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; promo?: string }>;
}) {
  const session = await requireRole("customer");
  const query = await searchParams;
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const extras = openCharges(listCustomerCharges(person.id));
  const discounts = listCustomerDiscounts(person.id);
  const extraPlans = listCustomerExtraPlans(person.id);
  const due = invoiceFor(person, extras, { discounts, extraPlans }).due;
  const promo = query.promo ? findCataloguePromo(session.providerId, query.promo) : undefined;
  const promoMode = promo?.mode === "percent" || promo?.mode === "amount" ? promo.mode : undefined;
  const already = promo ? discounts.some((discount) => discount.name.toLowerCase() === promo.name.toLowerCase()) : false;
  const off = promo && promoMode && !already ? promoOff(due, promoMode, promo.value) : 0;
  const payable = Math.max(0, due - off);
  const nextDate = nextRenewalDate(person.renew_date, todayISO(), person.bill_cycle);
  const notice =
    query.notice === "gateway"
      ? "The payment gateway is not connected yet. Nothing was charged, the renewal is unchanged, and no receipt was issued."
      : query.notice;

  return (
    <>
      <p>
        <Link className="back" href="/subscriber">
          My connection
        </Link>
      </p>
      <header className="page-head pay-page-head">
        <div>
          <h1>Pay renewal</h1>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card pay-card">
        <header className="pay-hero">
          <span className="pay-kicker">Amount due</span>
          <p className="pay-amount">{formatInr(payable)}</p>
          <p className="pay-sub">
            {person.plan_name} · {formatSpeed(person.speed_mbps)} · {billCycleLabel(person.bill_cycle).toLowerCase()} · due {formatDate(person.renew_date)}
          </p>
          {off > 0 && promo ? (
            <p className="pay-chip">
              <span>
                {promo.name} takes {formatInr(off)} off {formatInr(due)}
              </span>
              <Link href="/subscriber/pay">Remove</Link>
            </p>
          ) : null}
        </header>
        {allows(session.productPlan, "onlinePay") ? (
          <div className="pay-body">
            <p className="pay-note">
              A confirmed payment moves the renewal {billCycleAdvance(person.bill_cycle)} ahead, to {formatDate(nextDate)}, and the receipt is issued then. Nothing is taken from a card or UPI account until the payment gateway is connected.
              {extras.length > 0 ? ` This bill adds ${extras.map((charge) => chargeSummary(charge)).join(", ")}.` : ""}
              {extraPlans.length > 0
                ? ` Also ${extraPlans.map((plan) => `${plan.plan_name} (${billCycleLabel(plan.bill_cycle).toLowerCase()})`).join(", ")}.`
                : ""}
              {billTaxNote(person)}
              {discounts.length > 0 ? ` Discounts: ${discounts.map((discount) => discountSummary(discount)).join(", ")}.` : ""}
            </p>
            <form action={payBill} className="pay-form">
              <PayMethods />
              <AddPromo code={off > 0 && promo ? promo.name : ""} action={applySubscriberPromo} />
              <SubmitButton className="btn primary pay-submit" pendingLabel="Contacting the gateway…">
                Pay {formatInr(payable)}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <div className="pay-body">
            <p className="pay-note">
              Online renewal is not on this connection. Pay {formatInr(due)} at the office
              {session.supportPhone ? ` or call ${session.supportPhone}` : ""}. The provider records it on your line.
            </p>
          </div>
        )}
      </article>
    </>
  );
}
