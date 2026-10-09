import Link from "next/link";
import { RevenueChart } from "@/components/revenue-chart";
import { requireOperator } from "@/lib/auth";
import { addDays, formatDate, formatInr, formatStamp, todayISO } from "@/lib/format";
import { listPlanCoupons, listPromoUses } from "@/lib/queries";

export const metadata = { title: "Promos" };

export default async function PromoReportPage() {
  await requireOperator();
  const codes = listPlanCoupons();
  const uses = listPromoUses();
  const desks = new Set(uses.map((use) => use.provider_id)).size;
  const discount = uses.reduce((sum, use) => sum + use.promo_off, 0);
  const paid = uses.filter((use) => use.status === "paid").reduce((sum, use) => sum + use.promo_off, 0);
  const today = todayISO();
  const start = addDays(today, -13);
  const byDay = new Map<string, number>();
  for (let day = start; day <= today; day = addDays(day, 1)) byDay.set(day, 0);
  for (const use of uses) {
    const day = use.created_at.slice(0, 10);
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + use.promo_off);
  }
  const points = [...byDay.entries()].map(([day, amount]) => ({
    label: formatDate(day).replace(/ \d{4}$/, ""),
    amount,
  }));

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Promos</h1>
          <p>Discount desks took on a plan payment. This is not money collected from a card.</p>
        </div>
        <Link className="btn" href="/zignal/settings">
          Promo codes
        </Link>
      </header>
      <section className="stats" aria-label="Promo summary">
        <article className="stat">
          <span>Codes</span>
          <b>{codes.length}</b>
        </article>
        <article className="stat">
          <span>Desks</span>
          <b>{desks}</b>
        </article>
        <article className="stat">
          <span>Discount given</span>
          <b className="money">{formatInr(discount)}</b>
        </article>
        <article className="stat">
          <span>On a paid plan</span>
          <b>{formatInr(paid)}</b>
        </article>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Discount in the last 14 days</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          Rupees taken off plan payments on each day. A day with no code stays at zero.
        </p>
        <RevenueChart points={points} />
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>By code</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>ISP</th>
                <th>Created</th>
                <th>Turned off</th>
                <th className="num">Desks</th>
                <th className="num">Discount</th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={6}>No promo code has been created.</td>
                </tr>
              ) : (
                codes.map((code) => (
                  <tr key={code.id}>
                    <td>
                      {code.code}
                      <div className="fine">{code.mode === "percent" ? `${code.value}% off` : `${formatInr(code.value)} off`}</div>
                    </td>
                    <td>{code.provider_id > 0 ? code.provider_name || "One ISP" : "Any ISP"}</td>
                    <td>{code.created_at ? formatStamp(code.created_at) : "—"}</td>
                    <td>{code.deactivated_at ? formatStamp(code.deactivated_at) : code.active ? "—" : "Off"}</td>
                    <td className="num">{code.desks}</td>
                    <td className="num">{formatInr(code.discount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>By desk</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          {uses.length === 0 ? "No desk has entered a code yet." : `${uses.length} ${uses.length === 1 ? "use" : "uses"}.`}
        </p>
        {uses.length === 0 ? null : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Desk</th>
                  <th>Code</th>
                  <th>Plan</th>
                  <th>When</th>
                  <th>Payment</th>
                  <th className="num">Discount</th>
                </tr>
              </thead>
              <tbody>
                {uses.map((use) => (
                  <tr key={use.id}>
                    <td>
                      <Link className="rowlink" href={`/zignal/provider/${use.provider_id}`}>
                        {use.provider_name}
                      </Link>
                    </td>
                    <td>{use.promo_code}</td>
                    <td>{use.plan_label}</td>
                    <td>{formatStamp(use.created_at)}</td>
                    <td>{use.status === "paid" ? (use.paid_at ? `Paid ${formatStamp(use.paid_at)}` : "Paid") : "Not paid yet"}</td>
                    <td className="num">{formatInr(use.promo_off)}</td>
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
