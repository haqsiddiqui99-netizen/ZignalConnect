import Link from "next/link";
import { importPlans, savePlan } from "@/lib/actions";
import { CsvPicker } from "@/components/csv-picker";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatInr, formatSpeed } from "@/lib/format";
import { getImportReport, listPlans } from "@/lib/queries";

export const metadata = { title: "Plans" };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; edit?: string; batch?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const plans = listPlans(session.providerId);
  const editing = plans.find((plan) => String(plan.id) === query.edit) ?? null;
  const report = getImportReport(session.providerId, query.batch ? Number(query.batch) : undefined, "plans");

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Plans</h1>
          <p>Add a plan by hand, or bring in a spreadsheet. Price changes apply the next time a subscriber pays.</p>
        </div>
        <a className="btn" href="/provider/plans/template">
          Download template
        </a>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>{editing ? `Edit ${editing.name}` : "New plan"}</h2>
          {editing ? (
            <p className="fine" style={{ marginTop: -6, marginBottom: 12 }}>
              <Link href="/provider/plans">Add a new plan instead</Link>
            </p>
          ) : null}
          <form action={savePlan} className="stack">
            {editing ? <input type="hidden" name="plan_id" value={editing.id} /> : null}
            <label className="field">
              <span>Name</span>
              <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Home 200" />
            </label>
            <div className="row-2">
              <label className="field">
                <span>Speed (Mbps)</span>
                <input name="speed_mbps" type="number" min={1} required defaultValue={editing?.speed_mbps ?? ""} placeholder="200" />
              </label>
              <label className="field">
                <span>Monthly price (₹)</span>
                <input name="price" type="number" min={1} required defaultValue={editing?.price ?? ""} placeholder="799" />
              </label>
            </div>
            <label className="field">
              <span>Data</span>
              <input name="data_cap" defaultValue={editing?.data_cap ?? "Unlimited"} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea name="description" defaultValue={editing?.description ?? ""} placeholder="Who this plan is for." />
            </label>
            <SubmitButton pendingLabel={editing ? "Saving…" : "Adding…"}>{editing ? "Save plan" : "Add plan"}</SubmitButton>
          </form>
        </article>
        <article className="card">
          <h2>Import plans</h2>
          <p className="fine" style={{ marginBottom: 12 }}>
            Use the template columns: name, speed, price, data, and description. A name that already exists is skipped.
          </p>
          <form action={importPlans} className="stack">
            <CsvPicker />
            <label className="field">
              <span>Or paste CSV</span>
              <textarea name="csv" required placeholder="name,speed,price,data,description" />
            </label>
            <SubmitButton pendingLabel="Importing…">Import plans</SubmitButton>
          </form>
          <div style={{ marginTop: 16 }}>
            <h2>Last import</h2>
            {!report ? (
              <p className="fine">No plans have been imported on this desk yet.</p>
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
          </div>
        </article>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Catalogue</h2>
        {plans.length === 0 ? (
          <p className="fine">No plans yet. Add one above, or import a file.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Speed</th>
                  <th className="num">Monthly</th>
                  <th>Data</th>
                  <th className="num">Subscribers</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.name}</td>
                    <td>{formatSpeed(plan.speed_mbps)}</td>
                    <td className="num">{formatInr(plan.price)}</td>
                    <td>{plan.data_cap}</td>
                    <td className="num">{plan.subscribers}</td>
                    <td>{plan.description}</td>
                    <td>
                      <Link href={`/provider/plans?edit=${plan.id}`}>Edit</Link>
                    </td>
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
