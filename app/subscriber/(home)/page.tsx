import Link from "next/link";
import { notFound } from "next/navigation";
import { changePassword } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner, StatusPill } from "@/components/ui";
import { billCycleLabel, nextRenewalDate } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import {
  connectionId,
  dueLabel,
  formatDate,
  formatInr,
  formatSpeed,
  formatStamp,
  isDate,
  todayISO,
} from "@/lib/format";
import { allows } from "@/lib/entitlements";
import { settleExpiredPromises } from "@/lib/promise-pay";
import { getSubscriberByUserId, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans, listPayments, listReminders } from "@/lib/queries";

export const metadata = { title: "My connection" };

function billingReminder(status: string, renewDate: string, plan: string, dueAmount: number, cycle: string, promiseOn: string) {
  const due = formatInr(dueAmount);
  const nextRenewal = formatDate(nextRenewalDate(renewDate, todayISO(), cycle));
  if (status === "suspended" || status === "disconnected") {
    const word = status === "disconnected" ? "disconnected" : "paused";
    return {
      title: status === "disconnected" ? "Service is disconnected" : "Service is paused",
      body: `This line is ${word}. Pay ${due} to turn ${plan} back on. Renewal will move to ${nextRenewal}.`,
    };
  }
  if (status === "collection") {
    return {
      title: "Account is in collection",
      body: `${plan} is in collection. The amount due is ${due}.`,
    };
  }
  if (status === "write_off") {
    return {
      title: "Account is written off",
      body: `${plan} is written off. Contact the provider before paying this line.`,
    };
  }
  if (promiseOn && promiseOn >= todayISO()) {
    return {
      title: "Promise to pay",
      body: `${plan} stays on until ${formatDate(promiseOn)}. The renewal date stays ${formatDate(renewDate)}. Pay ${due} on or before the promise date.`,
    };
  }
  const label = dueLabel(renewDate);
  if (label.includes("overdue")) {
    return {
      title: "Renewal overdue",
      body: `${plan} was due on ${formatDate(renewDate)}. Pay ${due} to carry the connection forward.`,
    };
  }
  if (label === "Due today" || label === "Due tomorrow" || label.startsWith("Due in")) {
    const days = label;
    const soon = days === "Due today" || days === "Due tomorrow" || /Due in [1-7] day/.test(days);
    if (soon) {
      return {
        title: days === "Due today" ? "Renewal is today" : days === "Due tomorrow" ? "Renewal is tomorrow" : "Renewal coming up",
        body: `${plan} renews on ${formatDate(renewDate)} (${label.toLowerCase()}). Amount due is ${due}.`,
      };
    }
  }
  return {
    title: "Account is current",
    body: `Next renewal is ${formatDate(renewDate)}. A reminder is posted here 3 days before that date and on the due date, if the bill is still open.`,
  };
}

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("customer");
  const query = await searchParams;
  await settleExpiredPromises();
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const payments = listPayments({ customerId: person.id }).slice(0, 3);
  const reminders = listReminders(person.id);
  const dueAmount = invoiceFor(person, listCustomerCharges(person.id), {
    discounts: listCustomerDiscounts(person.id),
    extraPlans: listCustomerExtraPlans(person.id),
  }).due;
  const live = billingReminder(person.status, person.renew_date, person.plan_name, dueAmount, person.bill_cycle, person.promise_on);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Hello, {person.name.split(" ")[0]}</h1>
          <p>Your line, the next renewal, and anything your provider has sent you.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="hero-card">
        <div>
          <p className="eyebrow">{connectionId(person.id)}</p>
          <h1>{person.plan_name}</h1>
          <p>
            {formatSpeed(person.speed_mbps)} · {person.data_cap}
          </p>
          <div style={{ marginTop: 12 }}>
            <StatusPill status={person.status} renewDate={person.renew_date} />
          </div>
        </div>
        <div>
          <p className="hero-price">{formatInr(dueAmount)}</p>
          <p>
            {billCycleLabel(person.bill_cycle).toLowerCase()} · renews {formatDate(person.renew_date)}
            {isDate(person.promise_on) && person.promise_on >= todayISO() ? ` · promise ${formatDate(person.promise_on)}` : ""}
          </p>
          <div style={{ marginTop: 14 }}>
            <Link className="btn light" href="/subscriber/pay">
              Pay renewal
            </Link>
          </div>
        </div>
      </section>
      <section className="split">
        <article className="card">
          <h2>Reminder</h2>
          <div className="reminder">
            <strong>{live.title}</strong>
            <p>{live.body}</p>
          </div>
          {allows(session.productPlan, "renewalReminders") && person.reminders ? (
            <p className="fine">
              An email goes out 3 days before the due date and on the due date, using the wording your provider saved. A copy stays on this page. A bill that is already paid does not get one.
            </p>
          ) : null}
          {reminders.length > 0 ? (
            <div className="list">
              <p className="fine">Messages from your provider</p>
              {reminders.map((reminder) => (
                <div key={reminder.id}>
                  <strong>{reminder.title}</strong>
                  <div className="fine">{formatStamp(reminder.created_at)}</div>
                  <p>{reminder.body}</p>
                </div>
              ))}
            </div>
          ) : null}
        </article>
        <article className="card">
          <h2>Account</h2>
          <dl className="facts">
            <dt>Name</dt>
            <dd>{person.name}</dd>
            <dt>Mobile</dt>
            <dd>{person.mobile}</dd>
            <dt>Email</dt>
            <dd>{person.email}</dd>
            <dt>Address</dt>
            <dd>
              {person.address}, {[person.city, person.state, person.pincode].filter(Boolean).join(" ")}
              {person.country ? `, ${person.country}` : ""}
            </dd>
            <dt>Installed</dt>
            <dd>{formatDate(person.installation_date)}</dd>
            <dt>Internet Plan</dt>
            <dd>{person.plan_description}</dd>
          </dl>
        </article>
      </section>
      <section className="split" style={{ marginTop: 14 }}>
        <article className="card">
          <h2>Recent receipts</h2>
          {payments.length === 0 ? (
            <p>No payments yet.</p>
          ) : (
            <table>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {formatStamp(payment.paid_at)}
                      <div className="fine">{payment.reference}</div>
                      <Link href={`/subscriber/receipt/${payment.id}`}>Receipt</Link>
                    </td>
                    <td>{payment.method}</td>
                    <td className="num">{formatInr(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ marginTop: 12 }}>
            <Link className="back" href="/subscriber/receipts">
              All receipts
            </Link>
          </p>
        </article>
        <article className="card">
          <h2>Password</h2>
          <form action={changePassword} className="stack">
            <label className="field">
              <span>Current password</span>
              <input name="current_password" type="password" autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input name="new_password" type="password" autoComplete="new-password" required minLength={6} />
            </label>
            <label className="field">
              <span>Confirm</span>
              <input name="confirm_password" type="password" autoComplete="new-password" required minLength={6} />
            </label>
            <SubmitButton className="btn small">Update password</SubmitButton>
          </form>
        </article>
      </section>
    </>
  );
}
