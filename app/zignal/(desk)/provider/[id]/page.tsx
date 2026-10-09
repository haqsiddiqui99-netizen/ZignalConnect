import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterForm, FilterLink } from "@/components/filter-form";
import { cancelDeskPromise, recordDeskPayment, saveDeskPromise, sendDeskMail } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { Banner, LineId, StatusPill } from "@/components/ui";
import { requireOperator } from "@/lib/auth";
import { billCycleLabel } from "@/lib/bill-cycle";
import { BILL_TERMS, CATALOG, isBillTerm, isProductPlan, termQuote } from "@/lib/entitlements";
import { formatClock, formatDate, formatInr, formatStamp, isDate, todayISO } from "@/lib/format";
import { LINE_STATUSES } from "@/lib/line-status";
import { savedPaymentLine } from "@/lib/pay-instrument";
import { promiseWindow, settleExpiredDeskPromises } from "@/lib/promise-pay";
import { nextDeskFeeDate } from "@/lib/renewals";
import { ensureDeskCharge } from "@/lib/receipts";
import { gstIncluded, gstMode } from "@/lib/tax";
import {
  getProvider,
  listDeskNotices,
  listProviderDeskBills,
  getPlatformProfile,
  listSubscribers,
  providerDeskFacts,
  subscriberStatusCounts,
  type ProviderDeskBill,
} from "@/lib/queries";

function DeskBill({ bill }: { bill: ProviderDeskBill }) {
  const lines = billLines(bill);
  const gross = lines.reduce((sum, line) => sum + line.amount, 0);
  const charged = Math.abs((bill.total || gross) - gross) < 0.01 ? gstIncluded(bill.total || gross) : gstIncluded(gross);
  const cgst = charged.cgst;
  const sgst = charged.sgst;
  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.description}>
              <td>{line.description}</td>
              <td className="num">{formatInr(line.amount, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="invoice-totals">
        <div>
          <span>Sub total</span>
          <span>{formatInr(charged.taxable, 2)}</span>
        </div>
        {bill.gst_mode === "igst" ? (
          <div>
            <span>IGST 18%</span>
            <span>{formatInr(charged.tax, 2)}</span>
          </div>
        ) : (
          <>
            <div>
              <span>CGST 9%</span>
              <span>{formatInr(cgst, 2)}</span>
            </div>
            <div>
              <span>SGST 9%</span>
              <span>{formatInr(sgst, 2)}</span>
            </div>
          </>
        )}
        <div>
          <span>Grand total</span>
          <span>{formatInr(bill.total || charged.total, 2)}</span>
        </div>
      </div>
      {!bill.paid_at ? (
        <p style={{ marginTop: 8 }}>
          <Link href={`/zignal/receipt/${bill.id}`}>Invoice</Link>
        </p>
      ) : null}
    </div>
  );
}

function BookedDeskInvoice({ label, amount, mode }: { label: string; amount: number; mode: "cgst" | "igst" }) {
  const charged = gstIncluded(amount);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{label}</td>
            <td className="num">{formatInr(amount, 2)}</td>
          </tr>
        </tbody>
      </table>
      <div className="invoice-totals">
        <div>
          <span>Sub total</span>
          <span>{formatInr(charged.taxable, 2)}</span>
        </div>
        {mode === "igst" ? (
          <div>
            <span>IGST 18%</span>
            <span>{formatInr(charged.igst, 2)}</span>
          </div>
        ) : (
          <>
            <div>
              <span>CGST 9%</span>
              <span>{formatInr(charged.cgst, 2)}</span>
            </div>
            <div>
              <span>SGST 9%</span>
              <span>{formatInr(charged.sgst, 2)}</span>
            </div>
          </>
        )}
        <div>
          <span>Grand total</span>
          <span>{formatInr(charged.total, 2)}</span>
        </div>
      </div>
    </div>
  );
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function billLines(bill: ProviderDeskBill) {
  const month = periodLabel(bill.period);
  const lines = [{ description: `${bill.plan_label} desk for ${month}`, amount: bill.plan_amount }];
  if (bill.prior_overage > 0) lines.push({ description: "Subscriber overflow from the previous bill", amount: bill.prior_overage });
  if (bill.overage_amount > 0) lines.push({ description: `Subscriber overflow for ${month}`, amount: bill.overage_amount });
  if (bill.prior_staff_overage > 0) lines.push({ description: "Staff overflow from the previous bill", amount: bill.prior_staff_overage });
  if (bill.staff_overage_amount > 0) lines.push({ description: `Staff overflow for ${month}`, amount: bill.staff_overage_amount });
  return lines;
}

const TABS = [
  { id: "account", label: "Account" },
  { id: "subscribers", label: "Subscribers" },
  { id: "invoice", label: "Invoice" },
  { id: "payment", label: "Payment" },
  { id: "reminders", label: "Reminders" },
] as const;

type Tab = (typeof TABS)[number]["id"];

function readTab(value: string | undefined): Tab {
  if (value === "subscribers" || value === "invoice" || value === "payment" || value === "reminders") return value;
  return "account";
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provider = getProvider(Number(id));
  return { title: provider?.name ?? "ISP" };
}

export default async function ProviderDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; view?: string; tab?: string; q?: string; status?: string; billing?: string; error?: string; notice?: string }>;
}) {
  await requireOperator();
  settleExpiredDeskPromises();
  const { id } = await params;
  const query = await searchParams;
  const providerId = Number(id);
  const provider = Number.isInteger(providerId) ? getProvider(providerId) : undefined;
  if (!provider) notFound();

  ensureDeskCharge(provider.id);
  const facts = providerDeskFacts(provider.id);
  const bills = listProviderDeskBills(provider.id);
  const notices = listDeskNotices(provider.id);
  const counts = subscriberStatusCounts(provider.id);
  const total = LINE_STATUSES.reduce((sum, item) => sum + counts[item.value], 0);
  const requested = Number(query.page);
  const people = listSubscribers(provider.id, {
    q: query.q,
    status: query.status,
    billing: query.billing,
    page: Number.isInteger(requested) ? requested : 1,
  });
  const today = todayISO();
  const tab = readTab(query.tab);
  const invoiceView = query.view === "closed" ? "closed" : "open";
  const planId = isProductPlan(provider.product_plan) ? provider.product_plan : "pro";
  const termId = isBillTerm(provider.billing_term) ? provider.billing_term : "monthly";
  const cycleDue = nextDeskFeeDate(provider.trial_ends, provider.created_at, termId);
  const promised = isDate(provider.promise_on) && provider.promise_on >= today;
  const paymentDue = promised ? provider.promise_on : cycleDue;
  const dates = promiseWindow(cycleDue || today, today);
  const openBills = bills.filter((bill) => !bill.paid_at);
  const closedBills = bills.filter((bill) => bill.paid_at);
  const paymentLine = savedPaymentLine(provider);
  const term = BILL_TERMS.find((item) => item.id === termId);
  const booked = termQuote(CATALOG[planId].price, termId).due;
  const fee = termQuote(CATALOG[planId].price, termId).perMonth;
  const seller = getPlatformProfile();
  const bookedTax = gstMode(seller.state, provider.state);
  const place = [provider.city, provider.state].filter(Boolean).join(", ");
  const address = [provider.address, provider.city, provider.state, provider.pincode, provider.country].filter(Boolean).join(", ");
  const desk = provider.closed_at
    ? `Closed ${formatDate(provider.closed_at)}`
    : provider.quit_on && provider.quit_on <= today
      ? "Waiting on payments"
      : provider.quit_on
        ? `Closing ${formatDate(provider.quit_on)}`
        : "Open";
  const network = provider.line_kind === "mikrotik" ? "MikroTik" : provider.line_kind === "radius" ? "RADIUS" : "Not connected";
  const from = people.total === 0 ? 0 : (people.page - 1) * 50 + 1;
  const to = (people.page - 1) * 50 + people.rows.length;

  function pageHref(page: number) {
    const params = new URLSearchParams();
    params.set("tab", "subscribers");
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    if (query.billing) params.set("billing", query.billing);
    if (page > 1) params.set("page", String(page));
    const text = params.toString();
    return text ? `/zignal/provider/${providerId}?${text}` : `/zignal/provider/${providerId}`;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <div className="head-line">
            <Link className="btn small" href="/zignal">
              ← Providers
            </Link>
            <h1>{provider.name}</h1>
          </div>
          <p>
            {place || "Place not set"} · {CATALOG[planId].label} · {term?.label ?? "Monthly"} · {desk}
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <nav className="catalogue-tabs" aria-label="ISP">
        {TABS.map((item) => (
          <Link key={item.id} href={`/zignal/provider/${providerId}?tab=${item.id}`} className={tab === item.id ? "active" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "invoice" ? (
        <nav className="invoice-switch" aria-label="Desk invoices">
          <Link href={`/zignal/provider/${providerId}?tab=invoice&view=open`} className={invoiceView === "open" ? "active" : undefined}>
            Open Invoice
          </Link>
          <Link href={`/zignal/provider/${providerId}?tab=invoice&view=closed`} className={invoiceView === "closed" ? "active" : undefined}>
            Closed Invoice
          </Link>
        </nav>
      ) : null}
      {tab === "invoice" && invoiceView === "open" ? (
        <article className="card" style={{ marginBottom: 16 }}>
          <h2>Open invoice</h2>
          <p className="fine" style={{ margin: "8px 0 12px" }}>
            {isDate(paymentDue) ? `The desk fee is due ${formatDate(paymentDue)}.` : "This desk has no fee date yet."}{" "}
            {openBills.length === 0 && isDate(provider.trial_ends.slice(0, 10)) && provider.trial_ends.slice(0, 10) >= today
              ? "The invoice is written when the trial ends. No card is charged."
              : "Recording a payment does not charge a card."}
          </p>
          {openBills.length === 0 ? (
            <>
              <p>Nothing is waiting on an issued invoice. This is the booked desk fee. Tax is inside that fee.</p>
              <BookedDeskInvoice label={`${CATALOG[planId].label} desk`} amount={booked} mode={bookedTax} />
            </>
          ) : (
            openBills.map((bill) => <DeskBill key={bill.id} bill={bill} />)
          )}
          {isDate(cycleDue) ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <tbody>
                  <tr>
                    <td>Payment due date</td>
                    <td className="num">{formatDate(paymentDue)}</td>
                  </tr>
                  {promised ? (
                    <tr>
                      <td>Original due date</td>
                      <td className="num">{formatDate(cycleDue)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
          {openBills.map((bill) => (
            <form key={`pay-${bill.id}`} action={recordDeskPayment} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="desk_payment_id" value={bill.id} />
              <input type="hidden" name="return_to" value={`/zignal/provider/${providerId}?tab=invoice`} />
              <div className="row-2">
                <label className="field">
                  <span>Record payment for {periodLabel(bill.period)}</span>
                  <select name="method" defaultValue="UPI">
                    <option>UPI</option>
                    <option>Bank transfer</option>
                    <option>Cash</option>
                    <option>Other</option>
                  </select>
                </label>
                <label className="field">
                  <span>Reference</span>
                  <input name="reference" placeholder="UPI or bank reference" />
                </label>
              </div>
              <SubmitButton pendingLabel="Saving…">Record payment</SubmitButton>
            </form>
          ))}
          {!provider.closed_at && isDate(cycleDue) ? (
            <div className="promise-pay">
              <h2>Promise to pay</h2>
              <p className="fine">
                The desk stays open until this date. A full payment on or before it keeps the next desk fee on the original cycle. A missed promise does not close the desk; the fee is overdue again the next morning.
              </p>
              <div className="promise-row">
                <form action={saveDeskPromise} className="promise-save">
                  <input type="hidden" name="provider_id" value={provider.id} />
                  <label className="field">
                    <span>Promise date</span>
                    <input name="promise_on" type="date" required min={dates.earliest} max={dates.latest} defaultValue={promised ? provider.promise_on : dates.earliest} />
                  </label>
                  <SubmitButton className="btn" pendingLabel="Saving…">
                    {promised ? "Update promise" : "Save promise"}
                  </SubmitButton>
                </form>
                {promised ? (
                  <form action={cancelDeskPromise} className="promise-remove">
                    <input type="hidden" name="provider_id" value={provider.id} />
                    <SubmitButton className="btn" pendingLabel="Removing…">
                      Remove promise
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}
      {tab === "invoice" && invoiceView === "closed" ? (
        <article className="card" style={{ marginBottom: 16 }}>
          <h2>Closed invoices</h2>
          <p className="fine" style={{ margin: "8px 0 12px" }}>
            A closed invoice is a desk fee that already has a receipt.
          </p>
          {closedBills.length === 0 ? (
            <p>No closed invoices yet.</p>
          ) : (
            closedBills.map((bill) => (
              <div key={bill.id} style={{ marginTop: 12 }}>
                <DeskBill bill={bill} />
                <p className="fine" style={{ marginTop: 8 }}>
                  Paid {formatStamp(bill.paid_at)}
                  {bill.method ? ` · ${bill.method}` : ""}
                  {bill.reference ? ` · ${bill.reference}` : ""} · <Link href={`/zignal/receipt/${bill.id}`}>Receipt</Link>
                </p>
              </div>
            ))
          )}
        </article>
      ) : null}
      {tab === "payment" ? (
      <article className="card account-sheet" style={{ marginBottom: 16 }}>
        <h2>Payment details</h2>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          This is the method the ISP saved for its own collections. It is not charged by Zignal.
        </p>
        {paymentLine ? (
          <dl className="fact-grid">
            <Fact label="Saved method" value={paymentLine} wide />
            <Fact label="Name" value={provider.pay_holder} />
            <Fact label="Detail" value={provider.pay_method === "upi" || provider.pay_via === "upi" ? provider.pay_detail : provider.pay_detail ? `•••• ${provider.pay_detail}` : ""} />
            <Fact label="Expiry" value={provider.pay_expiry} />
          </dl>
        ) : (
          <p>This ISP has not saved a payment method.</p>
        )}
        <h2 style={{ marginTop: 22 }}>Paid to Zignal</h2>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          Desk fees already recorded. A receipt is on the closed invoice.
        </p>
        {closedBills.length === 0 ? (
          <p>No desk fee has been recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Month</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closedBills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      {formatStamp(bill.paid_at)}
                      <div className="fine">{bill.reference}</div>
                    </td>
                    <td>{periodLabel(bill.period)}</td>
                    <td>{bill.method || "—"}</td>
                    <td className="num">{formatInr(bill.total)}</td>
                    <td>
                      <Link href={`/zignal/receipt/${bill.id}`}>Receipt</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
      ) : null}
      {tab === "reminders" ? (
      <article className="card" style={{ marginBottom: 16 }}>
        <h2>Reminder mail</h2>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          Notes Zignal has emailed to this desk. The ISP cannot change them. Subscriber renewal wording saved on the desk is shown below.
        </p>
        {provider.reminder_soon_title || provider.reminder_due_title ? (
          <div className="list" style={{ marginBottom: 16 }}>
            {provider.reminder_soon_title ? (
              <div className="reminder">
                <strong>{provider.reminder_soon_title}</strong>
                <span className="fine">Sent to subscribers 3 days before renewal</span>
                <p>{provider.reminder_soon_body}</p>
              </div>
            ) : null}
            {provider.reminder_due_title ? (
              <div className="reminder">
                <strong>{provider.reminder_due_title}</strong>
                <span className="fine">Sent to subscribers on the renewal date</span>
                <p>{provider.reminder_due_body}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="fine" style={{ marginBottom: 16 }}>
            This desk has not changed the subscriber renewal note. The standard wording is used.
          </p>
        )}
        {notices.length === 0 ? (
          <p className="fine">No note has been sent to this desk yet.</p>
        ) : (
          <div className="list" style={{ marginBottom: 16 }}>
            {notices.map((note) => (
              <div className="reminder" key={note.id}>
                <strong>{note.title}</strong>
                <span className="fine">
                  {formatStamp(note.created_at)} · {note.channel}
                </span>
                <p>{note.body}</p>
              </div>
            ))}
          </div>
        )}
        {!provider.closed_at ? (
          <form action={sendDeskMail} className="stack">
            <input type="hidden" name="provider_id" value={provider.id} />
            <input type="hidden" name="return_to" value={`/zignal/provider/${providerId}?tab=reminders`} />
            <input type="hidden" name="channel" value="email" />
            <label className="field">
              <span>Title</span>
              <input name="title" required maxLength={80} placeholder="Plan change, trial ending, visit booked" />
            </label>
            <label className="field">
              <span>Message</span>
              <textarea name="body" required maxLength={400} rows={3} placeholder="This is emailed to the desk owner." />
            </label>
            <SubmitButton className="btn small" pendingLabel="Sending…">
              Send note
            </SubmitButton>
          </form>
        ) : null}
      </article>
      ) : null}
      {tab === "account" ? (
      <>
      <section className="stats line" aria-label="Subscribers">
        <article className="stat">
          <span>All subscribers</span>
          <b>{total}</b>
        </article>
        {LINE_STATUSES.map((item) => (
          <article key={item.value} className="stat">
            <span>{item.label}</span>
            <b>{counts[item.value]}</b>
          </article>
        ))}
      </section>
      <article className="card" style={{ marginBottom: 16 }}>
        <p>
          {facts.overdue} {facts.overdue === 1 ? "line is" : "lines are"} past the renewal date. A past-due line stays active until the ISP sets it to Paused, Disconnect, Collection, or Write off.
        </p>
      </article>
      <article className="card account-sheet" style={{ marginBottom: 16 }}>
        <h2>ISP</h2>
        <dl className="fact-grid">
          <Fact label="ISP" value={provider.name} />
          <Fact label="Owner" value={facts.ownerName} />
          <Fact label="Owner email" value={facts.ownerEmail} />
          <Fact label="Owner mobile" value={facts.ownerMobile} />
          <Fact label="Support phone" value={provider.support_phone} />
          <Fact label="GSTIN" value={provider.gstin} />
          <Fact label="Address" value={address} wide />
          <Fact label="Plan" value={CATALOG[planId].label} />
          <Fact label="Billing" value={term ? `${term.label} · ${formatInr(fee)} a month` : formatInr(fee)} />
          <Fact label="Book size" value={provider.subscriber_base > 0 ? String(provider.subscriber_base) : ""} />
          <Fact label="Opened" value={formatClock(provider.created_at)} />
          <Fact label="Last login" value={facts.lastLogin ? formatClock(facts.lastLogin) : "Not yet"} />
          <Fact label="Trial end" value={provider.trial_ends ? formatClock(provider.trial_ends) : ""} />
          <Fact label="Desk" value={desk} />
          <Fact label="Closing note" value={provider.quit_reason} wide />
          <Fact label="Network" value={network} />
          <Fact label="Router" value={provider.line_host} />
        </dl>
      </article>
      </>
      ) : null}
      {tab === "subscribers" ? (
      <article className="card">
        <h2>Subscribers</h2>
        <FilterForm className="filters" action={`/zignal/provider/${providerId}`} key={[query.q, query.billing, query.status].join("|")}>
          <input type="hidden" name="tab" value="subscribers" />
          <input name="q" placeholder="Name, mobile, city, email" defaultValue={query.q ?? ""} />
          <select name="billing" defaultValue={query.billing ?? ""}>
            <option value="">All billing</option>
            <option value="due">Due in 7 days</option>
            <option value="overdue">Overdue</option>
          </select>
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Any status</option>
            {LINE_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button className="btn small" type="submit">
            Filter
          </button>
          <FilterLink className="btn small" href={`/zignal/provider/${providerId}?tab=subscribers`}>
            Reset
          </FilterLink>
        </FilterForm>
        <p className="fine" style={{ margin: "8px 0 12px" }}>
          {people.total === 0
            ? query.q || query.status || query.billing
              ? "No subscribers match that filter."
              : "No subscribers on this desk."
            : `${from}–${to} of ${people.total}.`}
        </p>
        {people.rows.length === 0 ? null : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Contact</th>
                  <th>Internet plan</th>
                  <th>Renewal</th>
                  <th>Payment due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {people.rows.map((person) => {
                  const promised = isDate(person.promise_on) && person.promise_on >= today;
                  return (
                    <tr key={person.id}>
                      <td>
                        {person.name}
                        <div>
                          <LineId id={person.id} /> · {person.city}
                        </div>
                      </td>
                      <td>
                        {person.mobile}
                        <div className="fine">{person.email}</div>
                      </td>
                      <td>
                        {person.plan_name}
                        <div className="fine">{billCycleLabel(person.bill_cycle)}</div>
                      </td>
                      <td>{formatDate(person.renew_date)}</td>
                      <td>
                        {formatDate(promised ? person.promise_on : person.renew_date)}
                        {promised ? <div className="fine">Promise to Pay</div> : null}
                      </td>
                      <td>
                        <StatusPill status={person.status} renewDate={person.renew_date} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {people.pages > 1 ? (
          <div className="pager">
            {people.page > 1 ? (
              <FilterLink className="btn" href={pageHref(people.page - 1)}>
                Previous page
              </FilterLink>
            ) : (
              <span className="btn" aria-disabled="true">
                Previous page
              </span>
            )}
            <span className="fine">
              Page {people.page} of {people.pages}
            </span>
            {people.page < people.pages ? (
              <FilterLink className="btn" href={pageHref(people.page + 1)}>
                Next page
              </FilterLink>
            ) : (
              <span className="btn" aria-disabled="true">
                Next page
              </span>
            )}
          </div>
        ) : null}
      </article>
      ) : null}
    </>
  );
}
