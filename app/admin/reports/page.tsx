import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { allows } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { collectionReport } from "@/lib/queries";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await requireRole("admin");
  if (!session.isOwner) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>Reports</h1>
            <p>The collection report is for the owner.</p>
          </div>
        </header>
        <article className="card">
          <p>Staff can see each subscriber’s receipts. The monthly total and the spreadsheet stay with the owner.</p>
        </article>
      </>
    );
  }
  if (!allows(session.productPlan, "reports")) {
    return (
      <>
        <header className="page-head">
          <div>
            <h1>Reports</h1>
            <p>Collection totals and a spreadsheet export are part of Pro, Ultra, and Premium.</p>
          </div>
        </header>
        <article className="card">
          <p>The monthly report is part of every desk plan.</p>
          <p style={{ marginTop: 12 }}>
            <Link className="btn primary" href="/admin/billing">
              See plans
            </Link>
          </p>
        </article>
      </>
    );
  }

  const report = collectionReport(session.providerId);
  const showAreas = allows(session.productPlan, "areas");
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Collected this month</h1>
          <p>{formatInr(report.total)} across the plans on this desk.</p>
        </div>
        <a className="btn" href="/admin/reports/export">
          Export payments
        </a>
      </header>
      <section className="split">
        <article className="card">
          <h2>By plan</h2>
          {report.byPlan.length === 0 ? (
            <p>No payments this month yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Receipts</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.byPlan.map((row) => (
                  <tr key={row.plan_name}>
                    <td>{row.plan_name}</td>
                    <td className="num">{row.count}</td>
                    <td className="num">{formatInr(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
        {showAreas ? (
          <article className="card">
            <h2>By area</h2>
            {report.byArea.length === 0 ? (
              <p>No payments this month yet.</p>
            ) : (
              <table>
                <tbody>
                  {report.byArea.map((row) => (
                    <tr key={row.area}>
                      <td>{row.area}</td>
                      <td className="num">{formatInr(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        ) : (
          <article className="card">
            <h2>Areas</h2>
            <p>Splitting collection by area or branch is part of Ultra and Premium.</p>
          </article>
        )}
      </section>
    </>
  );
}
