import Link from "next/link";
import { importPayments } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getImportReport } from "@/lib/queries";

export const metadata = { title: "Import payments" };

export default async function ImportPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; batch?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const report = getImportReport(session.providerId, query.batch ? Number(query.batch) : undefined, "payments");

  return (
    <>
      <p>
        <Link className="btn small" href="/provider/subscriber">
          ← All subscribers
        </Link>
      </p>
      <header className="page-head">
        <div>
          <h1>Import payments</h1>
          <p>Record payments for subscribers who are already on this desk. Each row is one payment.</p>
        </div>
        <a className="btn" href="/provider/payments/template">
          Download template
        </a>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>Upload</h2>
          <form action={importPayments} className="stack">
            <label className="field">
              <span>Spreadsheet file</span>
              <input name="workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
            </label>
            <SubmitButton pendingLabel="Importing…">Import payments</SubmitButton>
          </form>
          <div className="stack" style={{ marginTop: 16 }}>
            <strong>Use the Payments tab.</strong>
            <ol className="fine info-list">
              <li>Email finds the subscriber. When mobile or name is filled in, it has to match that subscriber. A blank email can match on mobile alone.</li>
              <li>Source is a dropdown: UPI, Cash, or Internet.</li>
              <li>Payment amount is whole rupees. Date can be YYYY-MM-DD or DD/MM/YYYY.</li>
              <li>Transaction id is stored on the receipt. Leave it blank for cash and a reference is created. The same transaction id is not recorded twice.</li>
              <li>A payment that covers the open bill moves the renewal date, the same as recording it on the subscriber. A smaller amount is a partial payment and leaves the renewal date.</li>
            </ol>
          </div>
        </article>
        <article className="card">
          <h2>Last import</h2>
          {!report ? (
            <p className="fine">No payments have been imported on this desk yet.</p>
          ) : (
            <>
              <p>
                {report.batch.imported} recorded, {report.batch.skipped} skipped.
              </p>
              {report.issues.length === 0 ? (
                <p className="fine">Every row in that file was accepted.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Why it was skipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.issues.map((issue) => (
                        <tr key={`${issue.line}-${issue.message}`}>
                          <td>{issue.line}</td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </article>
      </section>
    </>
  );
}
