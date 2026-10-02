import { requireOperator } from "@/lib/auth";
import { CATALOG } from "@/lib/entitlements";
import { formatDate, formatInr } from "@/lib/format";
import { operatorDesk } from "@/lib/queries";

export const metadata = { title: "Providers" };

export default async function OperatorHome() {
  await requireOperator();
  const desk = operatorDesk();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Providers</h1>
          <p>
            {desk.providers.length} ISP desks. Booked desk fees are {formatInr(desk.booked)} a month. No card has been
            charged.
          </p>
        </div>
      </header>
      <section className="stats">
        <article className="stat">
          <span>Providers</span>
          <b>{desk.providers.length}</b>
        </article>
        <article className="stat">
          <span>Booked desk fees</span>
          <b className="money">{formatInr(desk.booked)}</b>
        </article>
        <article className="stat">
          <span>Active lines</span>
          <b>{desk.active}</b>
        </article>
        <article className="stat">
          <span>Paused lines</span>
          <b>{desk.paused}</b>
        </article>
      </section>
      <article className="card" style={{ marginBottom: 16 }}>
        <p>
          {desk.subscribers} subscribers across every desk. {desk.overdue} lines are past their renewal date. A past-due
          line stays active until someone sets it to Paused, Disconnect, Collection, or Write off.
        </p>
        <p className="fine" style={{ marginTop: 8 }}>
          {desk.plans.map((item) => `${item.label} ${item.providers}`).join(" · ")}. Fees are {formatInr(CATALOG.pro.price)}{" "}
          Pro, {formatInr(CATALOG.ultra.price)} Ultra, and {formatInr(CATALOG.premium_3000.price)} to{" "}
          {formatInr(CATALOG.premium_30000.price)} across the Premium tiers.
        </p>
      </article>
      <article className="card">
        {desk.providers.length === 0 ? (
          <p>No providers yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ISP</th>
                  <th>Plan</th>
                  <th className="num">Book size</th>
                  <th>Opened</th>
                  <th>Support</th>
                  <th className="num">Subscribers</th>
                  <th className="num">Active</th>
                  <th className="num">Paused</th>
                  <th className="num">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {desk.providers.map((provider) => (
                  <tr key={provider.id}>
                    <td>{provider.name}</td>
                    <td>{CATALOG[provider.product_plan].label}</td>
                    <td className="num">{provider.subscriber_base > 0 ? provider.subscriber_base : "—"}</td>
                    <td>{formatDate(provider.created_at)}</td>
                    <td>{provider.support_phone || "—"}</td>
                    <td className="num">{provider.subscribers}</td>
                    <td className="num">{provider.active}</td>
                    <td className="num">{provider.paused}</td>
                    <td className="num">{provider.overdue}</td>
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
