import Link from "next/link";
import { importCustomers } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { limitLabel } from "@/lib/entitlements";
import { getImportReport, getUsage, listChargeCatalogue, listDiscountCatalogue, listPlans } from "@/lib/queries";

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
  const charges = listChargeCatalogue(session.providerId);
  const discounts = listDiscountCatalogue(session.providerId);
  const report = getImportReport(session.providerId, query.batch ? Number(query.batch) : undefined);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="head-line">
            <Link className="btn small" href="/provider/subscriber">
              ← All subscribers
            </Link>
            <h1>Import Subscribers</h1>
          </div>
          <p>
            {usage.customers} of {limitLabel(usage.customerCap)} used on {usage.catalog.label}. Overflow allows{" "}
            {limitLabel(usage.overflowCap)}. {usage.overflowSlots} can be added from this file.
          </p>
        </div>
        <a className="btn" href="/provider/import/template">
          Download template
        </a>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>Upload</h2>
          {plans.length === 0 ? (
            <p>
              Add at least one plan before importing. <Link href="/provider/plans">Open plans</Link>
            </p>
          ) : (
            <form action={importCustomers} className="stack">
              <label className="field">
                <span>Spreadsheet file</span>
                <input name="workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
              </label>
              <SubmitButton pendingLabel="Importing…">Import Subscribers</SubmitButton>
            </form>
          )}
          <div className="stack" style={{ marginTop: 16 }}>
            <strong>Use the template tabs.</strong>
            <ol className="fine info-list">
              <li>The file has four tabs: Account, Internet plan, One-time charge, and Discount. The same email ties the rows together. Upload it again for an email that is already on the desk to add the plan, charge, and discount lines. A file with only those tabs updates existing subscribers.</li>
              <li>Internet plan names, one-time charge names, and discount names must already be on the Catalogue page. This file does not create them. Those columns, plus bill cycle, payment reminders, and Internet Plan frequency, are dropdowns in the template. Download the template again after you add a plan, charge, or discount.</li>
              <li>Put one customer on Account. The first Internet plan row for that email is the main plan. Another row with the same email adds another plan.</li>
              <li>Leave the plan amount blank to use the catalogue price for that frequency. Leave a charge amount or tax blank to use the catalogue charge.</li>
              <li>A discount row needs only the email and the catalogue discount name. What it applies to, and the value, come from the catalogue.</li>
              <li>Dates can be YYYY-MM-DD or DD/MM/YYYY. The renewal date is set from the activation date, or the account installation date, plus that plan's frequency. Leave a charge date blank to use the account installation date.</li>
              <li>Bill cycle and Internet Plan frequency are Weekly, Bi-weekly, Monthly, Quarterly, Bi-annual, or Annual. Leave the plan frequency blank to follow the bill cycle. Payment reminders are Yes or No.</li>
              <li>Tax is a percent such as 18. Leave tax blank when it is already included.</li>
            </ol>
          </div>
          <p className="fine" style={{ marginTop: 12 }}>
            Internet plans this file can use: {plans.map((plan) => plan.name).join(", ") || "none yet"}.
          </p>
          <p className="fine">
            One-time charges: {charges.map((charge) => charge.name).join(", ") || "none yet"}. Discounts: {discounts.map((discount) => discount.name).join(", ") || "none yet"}.{" "}
            <Link href="/provider/plans">Open the catalogue</Link>
          </p>
        </article>
        <article className="card">
          <h2>Last import</h2>
          {!report ? (
            <p className="fine">Nothing has been imported on this desk yet.</p>
          ) : (
            <>
              <p>
                {report.batch.imported} added{report.batch.updated ? `, ${report.batch.updated} updated` : ""}, {report.batch.skipped} skipped.
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
