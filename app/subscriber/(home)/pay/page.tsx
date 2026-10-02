import Link from "next/link";
import { notFound } from "next/navigation";
import { payBill } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { allows } from "@/lib/entitlements";
import { formatDate, formatInr, formatSpeed, renewalAfterPayment } from "@/lib/format";
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
  const nextDate = renewalAfterPayment(person.renew_date);

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
            {person.plan_name} · {formatSpeed(person.speed_mbps)} · due {formatDate(person.renew_date)}
          </p>
        </div>
      </header>
      <Banner error={error} />
      <article className="card" style={{ maxWidth: 640 }}>
        <p className="hero-price" style={{ color: "var(--ink)" }}>
          {formatInr(person.price)}
        </p>
        {allows(session.productPlan, "onlinePay") ? (
          <>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          Paying this moves your renewal to {formatDate(nextDate)}. If the line is paused, it comes back on. This records the payment on the provider desk and does not charge a real card or UPI account.
        </p>
        <form action={payBill} className="stack">
          <div className="choices">
            {["UPI", "Card", "Net banking"].map((method, index) => (
              <label className="choice" key={method}>
                <input type="radio" name="method" value={method} defaultChecked={index === 0} />
                <span>{method}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span>UPI id or card last 4 (optional)</span>
            <input name="detail" placeholder="name@upi or 4242" autoComplete="off" />
          </label>
          <SubmitButton pendingLabel="Recording payment…">Pay {formatInr(person.price)}</SubmitButton>
        </form>
          </>
        ) : (
          <p style={{ marginTop: 12 }}>
            Online renewal is not on this connection. Pay {formatInr(person.price)} at the office
            {session.supportPhone ? ` or call ${session.supportPhone}` : ""}. The provider records it on your line.
          </p>
        )}
      </article>
    </>
  );
}
