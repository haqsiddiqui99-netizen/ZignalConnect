import Link from "next/link";
import { notFound } from "next/navigation";
import { resetPortalPassword, sendReminder } from "@/lib/actions";
import { SubscriberBilling } from "@/components/subscriber-billing";
import { SubscriberForm } from "@/components/subscriber-form";
import { SubscriberSheet } from "@/components/subscriber-sheet";
import { SubmitButton } from "@/components/submit-button";
import { Banner, StatusPill } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { allows } from "@/lib/entitlements";
import { connectionId, formatStamp } from "@/lib/format";
import { settleExpiredPromises } from "@/lib/promise-pay";
import { getSubscriber, listChargeCatalogue, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans, listDiscountCatalogue, listPayments, listPlans, listReminders } from "@/lib/queries";

const TABS = [
  { id: "account", label: "Account" },
  { id: "invoice", label: "Invoice" },
  { id: "plans", label: "Active Plans" },
  { id: "payment", label: "Payment" },
  { id: "reminders", label: "Reminders" },
  { id: "password", label: "Password Reset" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function readTab(value: string | undefined): Tab {
  if (value === "billing" || value === "invoice") return "invoice";
  if (value === "plans" || value === "payment" || value === "reminders" || value === "password") return value;
  return "account";
}

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
  searchParams: Promise<{ error?: string; notice?: string; tab?: string; line?: string; edit?: string; view?: string }>;
}) {
  const session = await requireRole("admin");
  const { id } = await params;
  const query = await searchParams;
  await settleExpiredPromises();
  const person = getSubscriber(Number(id), session.providerId);
  if (!person) notFound();
  const tab = readTab(query.tab);
  const editing = tab === "account" && query.edit === "1";
  const showArea = allows(session.productPlan, "areas");
  const billing = tab === "invoice" || tab === "plans";
  const plans = tab === "plans" || editing ? listPlans(session.providerId) : [];
  const reminders = tab === "reminders" ? listReminders(person.id) : [];
  const payments = tab === "payment" || tab === "invoice" ? listPayments({ customerId: person.id }) : [];
  const savedCharges = billing ? listCustomerCharges(person.id) : [];
  const discounts = billing ? listCustomerDiscounts(person.id) : [];
  const extraPlans = billing ? listCustomerExtraPlans(person.id) : [];
  const chargeOptions = tab === "plans" ? listChargeCatalogue(session.providerId) : [];
  const offerOptions = tab === "plans" ? listDiscountCatalogue(session.providerId) : [];
  const invoiceView = query.view === "closed" ? "closed" : "open";

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
        </div>
        <StatusPill status={person.status} renewDate={person.renew_date} />
      </header>
      <Banner error={query.error} notice={query.notice} />
      <nav className="catalogue-tabs" aria-label="Subscriber">
        {TABS.map((item) => (
          <Link key={item.id} href={`/provider/subscriber/${person.id}?tab=${item.id}`} className={tab === item.id ? "active" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "account" ? (
        editing ? (
          <article className="card">
            <SubscriberForm plans={plans} subscriber={person} showArea={showArea} />
          </article>
        ) : (
          <SubscriberSheet person={person} showArea={showArea} />
        )
      ) : null}
      {tab === "invoice" ? (
        <nav className="invoice-switch" aria-label="Invoices">
          <Link href={`/provider/subscriber/${person.id}?tab=invoice&view=open`} className={invoiceView === "open" ? "active" : undefined}>
            Open Invoice
          </Link>
          <Link href={`/provider/subscriber/${person.id}?tab=invoice&view=closed`} className={invoiceView === "closed" ? "active" : undefined}>
            Closed Invoice
          </Link>
        </nav>
      ) : null}
      {tab === "invoice" || tab === "plans" || tab === "payment" ? (
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
          part={tab}
          view={invoiceView}
        />
      ) : null}
      {tab === "reminders" ? (
        <div className="stack">
          <article className="card">
            <h2>Send a reminder</h2>
            {person.reminders ? (
              <form action={sendReminder} className="stack">
                <input type="hidden" name="customer_id" value={person.id} />
                <div className="remind-bar">
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
                    <SubmitButton className="btn" name="preset" value="upcoming" pendingLabel="Sending…">
                      Renewal reminder
                    </SubmitButton>
                    <SubmitButton className="btn" name="preset" value="overdue" pendingLabel="Sending…">
                      Overdue notice
                    </SubmitButton>
                  </div>
                </div>
                <div className="row-2">
                  <label className="field">
                    <span>Custom title</span>
                    <input name="title" placeholder="Outage, plan change, visit booked" />
                  </label>
                  <label className="field">
                    <span>Custom message</span>
                    <textarea name="body" placeholder="This shows on the subscriber portal." />
                  </label>
                </div>
                <SubmitButton className="btn" name="preset" value="custom" pendingLabel="Sending…">
                  Send custom reminder
                </SubmitButton>
              </form>
            ) : (
              <p className="fine">Payment reminders are off for this line. Turn them on from Account, then Edit.</p>
            )}
          </article>
          <article className="card">
            <h2>Reminders sent</h2>
            {reminders.length === 0 ? (
              <p className="fine">Nothing has been sent yet.</p>
            ) : (
              <div className="list">
                {reminders.map((reminder) => (
                  <div className="reminder" key={reminder.id}>
                    <strong>{reminder.title}</strong>
                    <span className="fine">
                      {formatStamp(reminder.created_at)} · {reminder.channel}
                    </span>
                    <p>{reminder.body}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      ) : null}
      {tab === "password" ? (
        <article className="card desk-panel">
          <h2>Password reset</h2>
          <p className="fine">A link goes to {person.email}. The current password stays until they open it.</p>
          <form action={resetPortalPassword} className="password-row">
            <input type="hidden" name="customer_id" value={person.id} />
            <label className="field">
              <span>Send the reset link by</span>
              <select name="via" defaultValue={person.password_via || "email"}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">Message</option>
              </select>
            </label>
            <SubmitButton className="btn primary" pendingLabel="Sending…">
              Send reset link
            </SubmitButton>
          </form>
        </article>
      ) : null}
    </>
  );
}
