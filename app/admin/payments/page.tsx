import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { RevenueChart } from "@/components/revenue-chart";
import { addDays, addMonths, formatInr, formatStamp, isDate, monthBounds, todayISO } from "@/lib/format";
import { listPayments, paymentYears, providerRevenue } from "@/lib/queries";

export const metadata = { title: "Revenue" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SORTS = [
  { key: "paid_at", label: "When" },
  { key: "subscriber", label: "Subscriber" },
  { key: "method", label: "Method" },
  { key: "reference", label: "Reference" },
  { key: "amount", label: "Amount", num: true },
  { key: "kind", label: "Kind" },
];

function rangeFromQuery(query: { year?: string; month?: string; from?: string; to?: string }) {
  const today = todayISO();
  const { next } = monthBounds(today);
  if (isDate(query.from ?? "") && isDate(query.to ?? "") && query.from! <= query.to!) {
    return { from: query.from!, to: addDays(query.to!, 1), ahead: query.to! >= today };
  }
  const year = Number(query.year);
  if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
    const month = Number(query.month);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      return { from, to: addMonths(from, 1), ahead: addMonths(from, 1) > today };
    }
    return { from: `${year}-01-01`, to: `${year + 1}-01-01`, ahead: year >= Number(today.slice(0, 4)) };
  }
  return { from: `${today.slice(0, 4)}-01-01`, to: next, ahead: true };
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; from?: string; to?: string; sort?: string; dir?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const range = rangeFromQuery(query);
  const sort = SORTS.some((item) => item.key === query.sort) ? query.sort! : "paid_at";
  const dir = query.dir === "asc" ? "asc" : "desc";
  const payments = listPayments(
    { providerId: session.providerId },
    { from: range.from, to: range.to, sort, dir },
  );
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const revenue = session.isOwner ? providerRevenue(session.providerId, range) : null;
  const years = paymentYears(session.providerId);

  function keep(extra: Record<string, string>) {
    const params = new URLSearchParams();
    if (query.year) params.set("year", query.year);
    if (query.month) params.set("month", query.month);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.sort) params.set("sort", query.sort);
    if (query.dir) params.set("dir", query.dir);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const text = params.toString();
    return text ? `/admin/payments?${text}` : "/admin/payments";
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Revenue</h1>
          <p>
            {payments.length} receipts
            {session.isOwner ? ` · ${formatInr(total)} in this view.` : "."}
          </p>
        </div>
      </header>
      <form className="filters" action="/admin/payments">
        <label className="field">
          <span>Year</span>
          <select name="year" defaultValue={query.year ?? ""}>
            <option value="">Any year</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Month</span>
          <select name="month" defaultValue={query.month ?? ""}>
            <option value="">All months</option>
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input type="date" name="from" defaultValue={query.from ?? ""} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" name="to" defaultValue={query.to ?? ""} />
        </label>
        <button className="btn small" type="submit">
          Show revenue
        </button>
        <Link className="btn small" href="/admin/payments">
          Clear
        </Link>
      </form>
      <p className="fine" style={{ margin: "-6px 0 14px" }}>
        Pick a year, or a year and month. A from and to date overrides the year. Month needs a year.
      </p>
      {revenue ? (
        <>
          <section className="stats trio">
            <article className="stat">
              <span>This month</span>
              <b className="money">{formatInr(revenue.current)}</b>
            </article>
            <article className="stat">
              <span>Last month</span>
              <b>{formatInr(revenue.past)}</b>
            </article>
            <article className="stat">
              <span>Future renewals</span>
              <b>{formatInr(revenue.expected)}</b>
            </article>
          </section>
          <article className="card" style={{ marginBottom: 16 }}>
            <h2>Collections</h2>
            <RevenueChart points={revenue.series} />
          </article>
        </>
      ) : (
        <p className="fine" style={{ marginBottom: 16 }}>
          Revenue totals are for the owner. Receipts for each subscriber stay in the list below.
        </p>
      )}
      <article className="card">
        {payments.length === 0 ? (
          <p>No payments in this range.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {SORTS.map((column) => {
                    const active = sort === column.key;
                    const nextDir = active && dir === "desc" ? "asc" : "desc";
                    return (
                      <th key={column.key} className={column.num ? "num" : undefined}>
                        <Link href={keep({ sort: column.key, dir: nextDir })} scroll={false}>
                          {column.label}
                          {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatStamp(payment.paid_at)}</td>
                    <td>
                      <Link className="rowlink" href={`/admin/customers/${payment.customer_id}`}>
                        {payment.customer_name}
                      </Link>
                    </td>
                    <td>{payment.method}</td>
                    <td>{payment.reference}</td>
                    <td className="num">{formatInr(payment.amount)}</td>
                    <td>{payment.kind === "partial" ? "Partial" : "Full cycle"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </>
  );
}
