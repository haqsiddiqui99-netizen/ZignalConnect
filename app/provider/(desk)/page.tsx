import Link from "next/link";
import { confirmUpiPayment, rejectUpiPayment } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { limitLabel, planForBook } from "@/lib/entitlements";
import { formatDate, formatInr, formatSpeed, formatStamp } from "@/lib/format";
import { dashboard, getUsage, listPendingUpiClaims } from "@/lib/queries";
import { carriedOverflow, syncDeskOverflow } from "@/lib/receipts";
import { SubmitButton } from "@/components/submit-button";
import { Banner, LineId, StatusPill } from "@/components/ui";

export const metadata = { title: "Overview" };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  syncDeskOverflow(session.providerId);
  const claims = listPendingUpiClaims(session.providerId);
  const stats = dashboard(session.providerId);
  const usage = getUsage(session.providerId);
  const unbilled = carriedOverflow(session.providerId);
  const width = Number.isFinite(usage.customerCap) ? Math.min(100, (usage.customers / usage.customerCap) * 100) : 12;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{greeting()}</h1>
          <p>
            {session.brandName} is on {usage.catalog.label}. {stats.active} active lines. {stats.overdue} overdue.
            {session.isOwner ? ` Booked monthly revenue is ${formatInr(stats.booked)}.` : ""}
          </p>
        </div>
        <Link className="btn primary" href="/provider/subscriber/new">
          Add subscriber
        </Link>
      </header>
      <Banner error={query.error} notice={query.notice} />
      {claims.length > 0 ? (
        <article className="card">
          <h2>UPI awaiting confirmation</h2>
          <p className="fine">
            These subscribers paid your UPI ID and sent the reference. Check that the amount reached your bank or UPI app, then confirm. Confirming moves the
            renewal and issues the receipt. Reject leaves the renewal unchanged.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th className="num">Amount</th>
                  <th>UPI reference</th>
                  <th>Sent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>
                      <Link className="rowlink" href={`/provider/subscriber/${claim.customer_id}`}>
                        {claim.customer_name}
                      </Link>
                      <div>
                        <LineId id={claim.customer_id} />
                      </div>
                    </td>
                    <td className="num">{formatInr(claim.amount)}</td>
                    <td>
                      {claim.utr}
                      {claim.promo_name ? <div className="fine">Promo {claim.promo_name}</div> : null}
                    </td>
                    <td>{formatStamp(claim.created_at)}</td>
                    <td>
                      <div className="claim-actions">
                        <form action={confirmUpiPayment}>
                          <input type="hidden" name="claim_id" value={claim.id} />
                          <SubmitButton className="btn small primary" pendingLabel="Confirming…">
                            Confirm
                          </SubmitButton>
                        </form>
                        <form action={rejectUpiPayment}>
                          <input type="hidden" name="claim_id" value={claim.id} />
                          <SubmitButton className="btn small" pendingLabel="Rejecting…">
                            Reject
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
      <article className="card usage-card">
        <div className="usage-copy">
          <strong>
            {usage.customers} of {limitLabel(usage.customerCap)} customers
          </strong>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${width}%` }} />
          </div>
          <p className="fine">
            {usage.customers > usage.overflowCap
              ? `${usage.catalog.label} holds ${limitLabel(usage.customerCap)} subscribers and will not cover this book of ${usage.customers}. Upgrade to ${planForBook(usage.customers)}. ${
                  usage.trial.active
                    ? `Trial until ${formatDate(usage.trial.ends)}, so every subscriber stays until then. `
                    : usage.trial.ended
                      ? `The trial ended on ${formatDate(usage.trial.ends)}. Adding subscribers stays paused until this desk is on a plan that covers the book. `
                      : ""
                }`
              : usage.trial.ended
              ? `The trial ended on ${formatDate(usage.trial.ends)}. Adding subscribers is paused. Existing lines can still be billed. `
              : usage.overflowSlots === 0
                ? `Past the 10% overflow (${limitLabel(usage.overflowCap)}). Upgrade to the next tier to add more. `
                : usage.overage > 0
                  ? `${usage.overage} subscribers over the ${limitLabel(usage.customerCap)} cap, at ₹3 each (${formatInr(usage.overageDue)} this month). ${usage.overflowSlots} overflow slots left. ${
                      unbilled > 0
                        ? `${formatInr(unbilled)} was added after this month's invoice was paid, so it is added to next month's bill together with next month's overflow. `
                        : ""
                    }`
                  : `${limitLabel(usage.customerSlots)} customer slots left. A short overflow runs to ${limitLabel(usage.overflowCap)} at ₹3 each. `}
            {usage.trial.active && usage.customers <= usage.overflowCap
              ? `Trial until ${formatDate(usage.trial.ends)}. The first month can take the whole list. `
              : ""}
            <Link href="/provider/import">Import</Link>
          </p>
        </div>
        <Link className="btn primary" href="/provider/upgrade">
          Upgrade
        </Link>
      </article>
      <section className={session.isOwner ? "stats" : "stats pair"}>
        {session.isOwner ? (
          <>
            <article className="stat">
              <span>Booked monthly</span>
              <b>{formatInr(stats.booked)}</b>
            </article>
            <article className="stat">
              <span>Collected this month</span>
              <b className="money">{formatInr(stats.collected)}</b>
            </article>
          </>
        ) : null}
        <article className="stat">
          <span>Due within 7 days</span>
          <b>{stats.due}</b>
        </article>
        <article className="stat">
          <span>Overdue bills</span>
          <b>{stats.overdue}</b>
        </article>
      </section>
      <section className="split">
        <article className="card">
          <h2>Renewals</h2>
          <p className="fine">
            Overdue, and anything due in the next 14 days.
          </p>
          {stats.renewals.length === 0 ? (
            <p>No renewals in that window.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subscriber</th>
                    <th>Internet plan</th>
                    <th>Renewal</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.renewals.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <Link className="rowlink" href={`/provider/subscriber/${person.id}`}>
                          {person.name}
                        </Link>
                        <div>
                          <LineId id={person.id} />
                        </div>
                      </td>
                      <td>
                        {person.plan_name}
                        <div className="fine">{formatSpeed(person.speed_mbps)}</div>
                      </td>
                      <td>{formatDate(person.renew_date)}</td>
                      <td>
                        <StatusPill status={person.status} renewDate={person.renew_date} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
        <article className="card">
          <h2>Recent payments</h2>
          {stats.recent.length === 0 ? (
            <p>No payments recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subscriber</th>
                    <th className="num">Amount</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link className="rowlink" href={`/provider/subscriber/${payment.customer_id}`}>
                          {payment.customer_name}
                        </Link>
                        <div className="fine">{payment.method}</div>
                      </td>
                      <td className="num">{formatInr(payment.amount)}</td>
                      <td>
                        {formatDate(payment.paid_at)}
                        <div className="fine">
                          <Link href={`/provider/receipt/income/${payment.id}`}>Receipt</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </>
  );
}
