import Link from "next/link";
import { notFound } from "next/navigation";
import { payBill } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PayMethods } from "@/components/pay-methods";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { allows } from "@/lib/entitlements";
import { billCycleAdvance, billCycleLabel, billCycleMonths, cycleAmount } from "@/lib/bill-cycle";
import { formatDate, formatInr, formatSpeed, renewalAfterPayment, todayISO } from "@/lib/format";
import { getSubscriberByUserId } from "@/lib/queries";

export const metadata = { title: "Pay bill" };

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole("customer");
  const { error } = await searchParams;
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const due = cycleAmount(person.price, person.bill_cycle);
  const nextDate = renewalAfterPayment(person.renew_date, todayISO(), billCycleMonths(person.bill_cycle));

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
      <Banner error={error} />
      <article className="card" style={{ maxWidth: 640 }}>
        <p className="hero-price" style={{ color: "var(--ink)" }}>
          {formatInr(due)}
        </p>
        {allows(session.productPlan, "onlinePay") ? (
          <>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          Paying this {billCycleLabel(person.bill_cycle).toLowerCase()} bill moves your renewal {billCycleAdvance(person.bill_cycle)} ahead, to {formatDate(nextDate)}. If the line is paused, it comes back on. This records the payment on the provider desk and does not charge a real card or UPI account.
        </p>
        <form action={payBill} className="stack">
          <PayMethods />
          <SubmitButton pendingLabel="Recording payment…">Pay {formatInr(due)}</SubmitButton>
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
