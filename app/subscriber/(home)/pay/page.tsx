import Link from "next/link";
import { notFound } from "next/navigation";
import { payBill } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PayMethods } from "@/components/pay-methods";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { allows } from "@/lib/entitlements";
import { billCycleAdvance, billCycleLabel, nextRenewalDate } from "@/lib/bill-cycle";
import { billTaxNote, chargeSummary, discountSummary, invoiceFor, openCharges } from "@/lib/charges";
import { formatDate, formatInr, formatSpeed, todayISO } from "@/lib/format";
import { getSubscriberByUserId, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";

export const metadata = { title: "Pay bill" };

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("customer");
  const query = await searchParams;
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const extras = openCharges(listCustomerCharges(person.id));
  const discounts = listCustomerDiscounts(person.id);
  const extraPlans = listCustomerExtraPlans(person.id);
  const due = invoiceFor(person, extras, { discounts, extraPlans }).due;
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
      <header className="page-head">
        <div>
          <h1>Pay renewal</h1>
          <p>
            {person.plan_name} · {formatSpeed(person.speed_mbps)} · {billCycleLabel(person.bill_cycle).toLowerCase()} · due {formatDate(person.renew_date)}
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card" style={{ maxWidth: 640 }}>
        <p className="hero-price" style={{ color: "var(--ink)" }}>
          {formatInr(due)}
        </p>
        {allows(session.productPlan, "onlinePay") ? (
          <>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          The payment gateway collects this {billCycleLabel(person.bill_cycle).toLowerCase()} bill. A confirmed charge moves the renewal {billCycleAdvance(person.bill_cycle)} ahead, to {formatDate(nextDate)}, and that is when the receipt is issued. Until the gateway is connected, nothing is taken from a card or UPI account.
          {extras.length > 0
            ? ` This bill adds ${extras.map((charge) => chargeSummary(charge)).join(", ")}. One-time charges are left off later bills.`
            : ""}
          {extraPlans.length > 0
            ? ` Also ${extraPlans.map((plan) => `${plan.plan_name} (${billCycleLabel(plan.bill_cycle).toLowerCase()})`).join(", ")}.`
            : ""}
          {billTaxNote(person)}
          {discounts.length > 0 ? ` Discounts: ${discounts.map((discount) => discountSummary(discount)).join(", ")}.` : ""}
        </p>
        <form action={payBill} className="stack">
          <PayMethods />
          <SubmitButton pendingLabel="Contacting the gateway…">Pay {formatInr(due)}</SubmitButton>
        </form>
          </>
        ) : (
          <p style={{ marginTop: 12 }}>
            Online renewal is not on this connection. Pay {formatInr(due)} at the office
            {session.supportPhone ? ` or call ${session.supportPhone}` : ""}. The provider records it on your line.
          </p>
        )}
      </article>
    </>
  );
}
