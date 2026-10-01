import Link from "next/link";
import { importCustomers } from "@/lib/actions";
import { CsvPicker } from "@/components/csv-picker";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { limitLabel } from "@/lib/entitlements";
import { getImportReport, getUsage, listPlans } from "@/lib/queries";

export const metadata = { title: "Import" };

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; batch?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const usage = getUsage(session.providerId);
  const plans = listPlans(session.providerId);
  const report = getImportReport(session.providerId, query.batch ? Number(query.batch) : undefined);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Import customers</h1>
          <p>
            {usage.customers} of {limitLabel(usage.customerCap)} used on {usage.catalog.label}.{" "}
            {Number.isFinite(usage.customerSlots) ? `${usage.customerSlots} can be added from this file.` : "There is no customer cap."}
          </p>
        </div>
        <a className="btn" href="/admin/import/template">
          Download template
        </a>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>Upload</h2>
          <p className="fine" style={{ marginBottom: 12 }}>
            Use the template columns. Plan names must already exist. Dates can be YYYY-MM-DD or DD/MM/YYYY. New portal passwords are welcome123.
          </p>
          {plans.length === 0 ? (
            <p>
              Add at least one plan before importing. <Link href="/admin/plans">Open plans</Link>
            </p>
          ) : (
            <form action={importCustomers} className="stack">
              <CsvPicker />
              <label className="field">
                <span>Or paste CSV</span>
                <textarea name="csv" required placeholder="name,email,mobile,address,city,plan,renewal date" />
              </label>
              <SubmitButton pendingLabel="Importing…">Import customers</SubmitButton>
            </form>
          )}
          <p className="fine" style={{ marginTop: 12 }}>
            Plans this file can use: {plans.map((plan) => plan.name).join(", ") || "none yet"}.
          </p>
        </article>
        <article className="card">
          <h2>Last import</h2>
          {!report ? (
            <p className="fine">Nothing has been imported on this desk yet.</p>
          ) : (
            <>
              <p>
                {report.batch.imported} added, {report.batch.skipped} skipped.
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
