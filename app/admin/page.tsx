import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { limitLabel } from "@/lib/entitlements";
import { formatDate, formatInr, formatSpeed } from "@/lib/format";
import { dashboard, getUsage } from "@/lib/queries";
import { LineId, StatusPill } from "@/components/ui";

export const metadata = { title: "Overview" };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome() {
  const session = await requireRole("admin");
  const stats = dashboard(session.providerId);
  const usage = getUsage(session.providerId);
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
        <Link className="btn primary" href="/admin/customers/new">
          Add subscriber
        </Link>
      </header>
      <article className="card usage-card" style={{ marginBottom: 16 }}>
        <div className="usage-copy">
          <strong>
            {usage.customers} of {limitLabel(usage.customerCap)} customers
          </strong>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${width}%` }} />
          </div>
          <p className="fine" style={{ marginTop: 8 }}>
            {usage.trial.ended
              ? `The trial ended on ${formatDate(usage.trial.ends)}. Adding subscribers is paused. Existing lines can still be billed. `
              : usage.overflowSlots === 0
                ? `Past the 10% overflow (${limitLabel(usage.overflowCap)}). Upgrade to the next tier to add more. `
                : usage.overage > 0
                  ? `${usage.overage} subscribers over the ${limitLabel(usage.customerCap)} cap, at ₹3 each (${formatInr(usage.overageDue)} this month). ${usage.overflowSlots} overflow slots left. `
                  : `${limitLabel(usage.customerSlots)} customer slots left. A short overflow runs to ${limitLabel(usage.overflowCap)} at ₹3 each. `}
            {usage.trial.active ? `Trial until ${formatDate(usage.trial.ends)}. The plan cap applies the whole time. ` : ""}
            <Link href="/admin/import">Import</Link>
          </p>
        </div>
        <Link className="btn primary" href="/admin/billing">
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
          <p className="fine" style={{ marginBottom: 8 }}>
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
                    <th>Plan</th>
                    <th>Renewal</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.renewals.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <Link className="rowlink" href={`/admin/customers/${person.id}`}>
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
                        <Link className="rowlink" href={`/admin/customers/${payment.customer_id}`}>
                          {payment.customer_name}
                        </Link>
                        <div className="fine">{payment.method}</div>
                      </td>
                      <td className="num">{formatInr(payment.amount)}</td>
                      <td>
                        {formatDate(payment.paid_at)}
                        <div className="fine">
                          <Link href={`/receipts/income/${payment.id}`}>Receipt</Link>
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
