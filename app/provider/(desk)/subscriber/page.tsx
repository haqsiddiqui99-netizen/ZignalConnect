import Link from "next/link";
import { FilterForm, FilterLink } from "@/components/filter-form";
import { requireRole } from "@/lib/auth";
import { billCycleLabel } from "@/lib/bill-cycle";
import { formatDate, formatInr, isDate, todayISO } from "@/lib/format";
import { listSubscribers, subscriberStatusCounts } from "@/lib/queries";
import { Banner, LineId, StatusPill } from "@/components/ui";
import { LINE_STATUSES } from "@/lib/line-status";

export const metadata = { title: "Subscribers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; billing?: string; page?: string; error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const requested = Number(params.page);
  const counts = subscriberStatusCounts(session.providerId);
  const deskTotal = LINE_STATUSES.reduce((sum, item) => sum + counts[item.value], 0);
  const people = listSubscribers(session.providerId, {
    q: params.q,
    status: params.status,
    billing: params.billing,
    page: Number.isInteger(requested) ? requested : 1,
  });

  function pageHref(page: number) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    if (params.billing) query.set("billing", params.billing);
    if (page > 1) query.set("page", String(page));
    const text = query.toString();
    return text ? `/provider/subscriber?${text}` : "/provider/subscriber";
  }

  const today = todayISO();
  const from = people.total === 0 ? 0 : (people.page - 1) * 50 + 1;
  const to = (people.page - 1) * 50 + people.rows.length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Subscribers</h1>
          <p>
            {people.total === 0 ? "0 shown." : `${from}–${to} of ${people.total}.`} Click here on a line for the password reset and a manual payment.
          </p>
        </div>
        <div className="demo-row">
          <Link className="btn" href="/provider/import">
            Import Subscribers
          </Link>
          <Link className="btn" href="/provider/payments">
            Import payments
          </Link>
        </div>
      </header>
      <Banner error={params.error} notice={params.notice} />
      <section className="stats line" aria-label="Subscriber summary">
        <FilterLink className={`stat${!params.status ? " on" : ""}`} href="/provider/subscriber">
          <span>All subscribers</span>
          <b>{deskTotal}</b>
        </FilterLink>
        {LINE_STATUSES.map((item) => (
          <FilterLink key={item.value} className={`stat${params.status === item.value ? " on" : ""}`} href={`/provider/subscriber?status=${item.value}`}>
            <span>{item.label}</span>
            <b>{counts[item.value]}</b>
          </FilterLink>
        ))}
      </section>
      <div className="subscriber-tools">
        <FilterForm className="filters" key={[params.q, params.billing, params.status].join("|")}>
          <input name="q" placeholder="Name, mobile, city, email" defaultValue={params.q ?? ""} />
          <select name="billing" defaultValue={params.billing ?? ""}>
            <option value="">All billing</option>
            <option value="due">Due in 7 days</option>
            <option value="overdue">Overdue</option>
          </select>
          <select name="status" defaultValue={params.status ?? ""}>
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
          <FilterLink className="btn small" href="/provider/subscriber">
            Reset
          </FilterLink>
        </FilterForm>
        <Link className="btn primary" href="/provider/subscriber/new">
          Add subscriber
        </Link>
      </div>
      <article className="card">
        {people.rows.length === 0 ? (
          <p>No subscribers match that filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">No.</th>
                  <th>Subscriber</th>
                  <th>Contact</th>
                  <th>Internet Plan</th>
                  <th>Renewal</th>
                  <th>Payment due</th>
                  <th className="num">Monthly</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {people.rows.map((person, index) => (
                  <tr key={person.id}>
                    <td className="num">{from + index}</td>
                    <td>
                      <Link className="rowlink" href={`/provider/subscriber/${person.id}`}>
                        {person.name}
                      </Link>
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
                      {formatDate(isDate(person.promise_on) && person.promise_on >= today ? person.promise_on : person.renew_date)}
                      {isDate(person.promise_on) && person.promise_on >= today ? <div className="fine">Promise to Pay</div> : null}
                    </td>
                    <td className="num">{formatInr(person.price)}</td>
                    <td>
                      <StatusPill status={person.status} renewDate={person.renew_date} />
                    </td>
                    <td>
                      <Link href={`/provider/subscriber/${person.id}`}>Click here</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {people.total > 0 ? (
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
    </>
  );
}
