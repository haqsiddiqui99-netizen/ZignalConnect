import Link from "next/link";
import { notFound } from "next/navigation";
import { resetPortalPassword, sendReminder } from "@/lib/actions";
import { SubscriberBilling } from "@/components/subscriber-billing";
import { SubscriberForm } from "@/components/subscriber-form";
import { SubmitButton } from "@/components/submit-button";
import { Banner, LineId, StatusPill } from "@/components/ui";
import { DEMO_CUSTOMER_PASSWORD } from "@/lib/demo";
import { requireRole } from "@/lib/auth";
import { allows } from "@/lib/entitlements";
import { connectionId, formatStamp } from "@/lib/format";
import { getSubscriber, listChargeCatalogue, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans, listDiscountCatalogue, listPayments, listPlans, listReminders } from "@/lib/queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin");
  const { id } = await params;
  const person = getSubscriber(Number(id), session.providerId);
  return { title: person?.name ?? "Subscriber" };
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; tab?: string; line?: string }>;
}) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  const person = getSubscriber(Number(id), session.providerId);
  if (!person) notFound();
  const tab = query.tab === "billing" ? "billing" : "account";
  const plans = listPlans(session.providerId);
  const showArea = allows(session.productPlan, "areas");
  const reminders = tab === "account" ? listReminders(person.id) : [];
  const payments = tab === "billing" ? listPayments({ customerId: person.id }) : [];
  const savedCharges = tab === "billing" ? listCustomerCharges(person.id) : [];
  const discounts = tab === "billing" ? listCustomerDiscounts(person.id) : [];
  const extraPlans = tab === "billing" ? listCustomerExtraPlans(person.id) : [];
  const chargeOptions = tab === "billing" ? listChargeCatalogue(session.providerId) : [];
  const offerOptions = tab === "billing" ? listDiscountCatalogue(session.providerId) : [];

  return (
    <>
      <p>
        <Link className="back" href="/provider/subscriber">
          All subscribers
        </Link>
      </p>
      <header className="page-head">
        <div>
          <p className="eyebrow-ink">{connectionId(person.id)}</p>
          <h1>{person.name}</h1>
          <p>
            {person.address}, {person.city} · {person.mobile}
          </p>
        </div>
        <StatusPill status={person.status} renewDate={person.renew_date} />
      </header>
      <Banner error={query.error} notice={query.notice} />
      <nav className="catalogue-tabs" aria-label="Subscriber">
        <Link href={`/provider/subscriber/${person.id}`} className={tab === "account" ? "active" : undefined}>
          Account settings
        </Link>
        <Link href={`/provider/subscriber/${person.id}?tab=billing`} className={tab === "billing" ? "active" : undefined}>
          Billing
        </Link>
      </nav>
      {tab === "billing" ? (
        <SubscriberBilling
          person={person}
          plans={plans.map((plan) => ({ id: plan.id, name: plan.name, speed_mbps: plan.speed_mbps, price: plan.price }))}
          chargeOptions={chargeOptions.map((item) => ({ id: item.id, name: item.name }))}
          offerOptions={offerOptions.map((item) => ({ id: item.id, name: item.name }))}
          charges={savedCharges}
          discounts={discounts}
          extraPlans={extraPlans}
          payments={payments}
          line={query.line ?? ""}
        />
      ) : (
        <>
      <article className="card" id="portal-password" style={{ marginBottom: 14 }}>
        <h2>Portal password</h2>
        <p style={{ margin: "8px 0 12px" }}>
          This subscriber signs in with <strong>{person.email}</strong>. If they forget the password, reset it to{" "}
          <strong>{DEMO_CUSTOMER_PASSWORD}</strong> and tell them.
        </p>
        <form action={resetPortalPassword}>
          <input type="hidden" name="customer_id" value={person.id} />
          <SubmitButton className="btn" pendingLabel="Resetting…">
            Reset password to {DEMO_CUSTOMER_PASSWORD}
          </SubmitButton>
        </form>
      </article>
      <section className="split">
        <article className="card">
          <h2>Service record</h2>
          <SubscriberForm plans={plans} subscriber={person} showArea={showArea} />
        </article>
        <div className="stack">
          <article className="card">
            <h2>Send a reminder</h2>
            {person.reminders ? (
            <form action={sendReminder} className="stack">
              <input type="hidden" name="customer_id" value={person.id} />
              <label className="field">
                <span>Send as</span>
                <select name="channel" defaultValue="portal">
                  <option value="portal">Portal message</option>
                  {allows(session.productPlan, "emailReminders") ? <option value="email">Email reminder</option> : null}
                  {allows(session.productPlan, "sms") ? <option value="sms">SMS</option> : null}
                  {allows(session.productPlan, "sms") ? <option value="whatsapp">WhatsApp</option> : null}
                </select>
              </label>
              <div className="demo-row">
                <SubmitButton className="btn small" name="preset" value="upcoming" pendingLabel="Sending…">
                  Renewal reminder
                </SubmitButton>
                <SubmitButton className="btn small" name="preset" value="overdue" pendingLabel="Sending…">
                  Overdue notice
                </SubmitButton>
              </div>
              <label className="field">
                <span>Custom title</span>
                <input name="title" placeholder="Outage, plan change, visit booked" />
              </label>
              <label className="field">
                <span>Custom message</span>
                <textarea name="body" placeholder="This shows on the subscriber portal." />
              </label>
              <SubmitButton className="btn" name="preset" value="custom" pendingLabel="Sending…">
                Send custom reminder
              </SubmitButton>
            </form>
            ) : (
              <p className="fine">Payment reminders are off for this line. Turn them on in the service record to send one.</p>
            )}
          </article>
        </div>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
          <h2>Reminders sent</h2>
          {reminders.length === 0 ? (
            <p className="fine">Nothing has been sent yet. The portal still shows a live renewal reminder from the due date.</p>
          ) : (
            <div className="list">
              {reminders.map((reminder) => (
                <div className="reminder" key={reminder.id}>
                  <strong>{reminder.title}</strong>
                  <span className="fine">{formatStamp(reminder.created_at)} · {reminder.channel}</span>
                  <p>{reminder.body}</p>
                </div>
              ))}
            </div>
          )}
      </article>
        </>
      )}
    </>
  );
}
