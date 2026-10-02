import Link from "next/link";
import { notFound } from "next/navigation";
import { recordPayment, resetPortalPassword, sendReminder } from "@/lib/actions";
import { SubscriberForm } from "@/components/subscriber-form";
import { SubmitButton } from "@/components/submit-button";
import { Banner, LineId, StatusPill } from "@/components/ui";
import { DEMO_CUSTOMER_PASSWORD } from "@/lib/demo";
import { requireRole } from "@/lib/auth";
import { allows } from "@/lib/entitlements";
import { billCycleAdvance, billCycleLabel, cycleAmount } from "@/lib/bill-cycle";
import { connectionId, formatDate, formatInr, formatSpeed, formatStamp } from "@/lib/format";
import { getSubscriber, listPayments, listPlans, listReminders } from "@/lib/queries";

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
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  const person = getSubscriber(Number(id), session.providerId);
  if (!person) notFound();
  const plans = listPlans(session.providerId);
  const payments = listPayments({ customerId: person.id });
  const reminders = listReminders(person.id);
  const showArea = allows(session.productPlan, "areas");

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
            <h2>Record manual payment</h2>
            <p className="fine" style={{ marginBottom: 12 }}>
              {person.plan_name} is {formatSpeed(person.speed_mbps)} · {person.data_cap} · {formatInr(person.price)} a month, billed{" "}
              {billCycleLabel(person.bill_cycle).toLowerCase()} ({formatInr(cycleAmount(person.price, person.bill_cycle))}). A full payment moves renewal{" "}
              {billCycleAdvance(person.bill_cycle)} ahead and turns the line back on. A smaller amount is stored as a partial payment.
            </p>
            <form action={recordPayment} className="stack">
              <input type="hidden" name="customer_id" value={person.id} />
              <div className="row-2">
                <label className="field">
                  <span>Amount (₹)</span>
                  <input name="amount" type="number" min={1} step={1} required defaultValue={cycleAmount(person.price, person.bill_cycle)} />
                </label>
                <label className="field">
                  <span>Method</span>
                  <select name="method" defaultValue="UPI">
                    <option>UPI</option>
                    <option>Card</option>
                    <option>Net banking</option>
                    <option>Cash</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Note</span>
                <input name="note" placeholder="Receipt number, UPI reference, who paid" />
              </label>
              <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
            </form>
          </article>
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
      <section className="split" style={{ marginTop: 14 }}>
        <article className="card">
          <h2>Payments</h2>
          {payments.length === 0 ? (
            <p>No payments on this line yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Method</th>
                    <th className="num">Amount</th>
                    <th>Covers until</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {formatStamp(payment.paid_at)}
                        <div className="fine">{payment.reference}</div>
                        <Link href={`/provider/receipt/income/${payment.id}`}>Receipt</Link>
                      </td>
                      <td>
                        {payment.method}
                        <div className="fine">{payment.kind === "partial" ? "Partial" : "Full cycle"}</div>
                      </td>
                      <td className="num">{formatInr(payment.amount)}</td>
                      <td>
                        {formatDate(payment.period_end)}
                        {payment.note ? <div className="fine">{payment.note}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
        <article className="card">
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
      </section>
    </>
  );
}
