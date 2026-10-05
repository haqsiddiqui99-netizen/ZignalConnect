import { FilterForm, FilterLink } from "@/components/filter-form";
import { requireOperator } from "@/lib/auth";
import { DeskFeeTable } from "@/components/desk-fee-table";
import { RevenueChart } from "@/components/revenue-chart";
import { addDays, addMonths, formatInr, formatStamp, isDate, todayISO } from "@/lib/format";
import { listProviderPayments, operatorDesk, paymentYears, zignalRevenue } from "@/lib/queries";
import { ensureDeskCharges, listDeskCharges } from "@/lib/receipts";

export const metadata = { title: "Revenue" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SORTS = [
  { key: "paid_at", label: "When" },
  { key: "provider", label: "Provider" },
  { key: "subscriber", label: "Subscriber" },
  { key: "method", label: "Method" },
  { key: "reference", label: "Reference" },
  { key: "amount", label: "Amount", num: true },
  { key: "kind", label: "Kind" },
];

function rangeFromQuery(query: { year?: string; month?: string; from?: string; to?: string }) {
  if (isDate(query.from ?? "") && isDate(query.to ?? "") && query.from! <= query.to!) {
    return { from: query.from!, to: addDays(query.to!, 1) };
  }
  const year = Number(query.year);
  if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
    const month = Number(query.month);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      return { from, to: addMonths(from, 1) };
    }
    return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
  }
  return {};
}

export default async function OperatorRevenue({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; from?: string; to?: string; sort?: string; dir?: string }>;
}) {
  await requireOperator();
  const query = await searchParams;
  const range = rangeFromQuery(query);
  const sort = SORTS.some((item) => item.key === query.sort) ? query.sort! : "paid_at";
  const dir = query.dir === "asc" ? "asc" : "desc";
  const revenue = zignalRevenue();
  const desk = operatorDesk();
  const payments = listProviderPayments({ ...range, sort, dir });
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const years = paymentYears();
  ensureDeskCharges();
  const deskFees = listDeskCharges();

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
    return text ? `/zignal/revenue?${text}` : "/zignal/revenue";
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Revenue</h1>
          <p>
            Booked desk fees for {revenue.providers} providers. These are the plan prices, not money collected from a
            card.
          </p>
        </div>
      </header>
      <section className="stats trio">
        <article className="stat">
          <span>This month</span>
          <b className="money">{formatInr(revenue.current)}</b>
        </article>
        <article className="stat">
          <span>Last month</span>
          <b>{revenue.past == null ? "Not recorded" : formatInr(revenue.past)}</b>
        </article>
        <article className="stat">
          <span>Expected next month</span>
          <b>{formatInr(revenue.expected)}</b>
        </article>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Revenue by plan</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          How many providers sit on each plan, and the monthly fee those desks book. This is the plan price, not money
          collected from a card.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th className="num">Providers</th>
                <th className="num">Fee each month</th>
                <th className="num">Booked revenue</th>
              </tr>
            </thead>
            <tbody>
              {desk.plans.map((item) => (
                <tr key={item.plan}>
                  <td>{item.label}</td>
                  <td className="num">{item.providers}</td>
                  <td className="num">{formatInr(item.price)}</td>
                  <td className="num">{formatInr(item.revenue)}</td>
                </tr>
              ))}
              <tr>
                <td>All plans</td>
                <td className="num">{desk.providers.length}</td>
                <td className="num" />
                <td className="num">{formatInr(desk.booked)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Fees by month</h2>
        <RevenueChart points={revenue.series} />
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Receipts from providers</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          What each ISP pays Zignal for the desk. Add the GSTIN under Settings so tax is shown on new receipts.
        </p>
        <DeskFeeTable
          charges={deskFees}
          canRecord
          receiptBase="/zignal/receipt"
          empty="No desk fee has been issued yet."
        />
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Subscriber payments</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          {payments.length} payments · {formatInr(total)}
          {range.from ? ` from ${range.from} to ${addDays(range.to ?? todayISO(), -1)}.` : " on every provider desk."}
        </p>
        <FilterForm className="filters labeled" action="/zignal/revenue" key={[query.year, query.month, query.from, query.to].join("|")}>
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
            Show payments
          </button>
          <FilterLink className="btn small" href="/zignal/revenue">
            Clear
          </FilterLink>
        </FilterForm>
        <p className="fine" style={{ margin: "-6px 0 14px" }}>
          Pick a year, or a year and month. A from and to date overrides the year. Month needs a year.
        </p>
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
                        <FilterLink href={keep({ sort: column.key, dir: nextDir })}>
                          {column.label}
                          {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
                        </FilterLink>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatStamp(payment.paid_at)}</td>
                    <td>{payment.provider_name}</td>
                    <td>{payment.customer_name}</td>
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
