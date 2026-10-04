import Link from "next/link";
import { importCatalogue, saveChargeCatalogue, saveDiscountCatalogue, savePlan } from "@/lib/actions";
import { CatalogueTaxFields, DiscountAppliesFields } from "@/components/catalogue-fields";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatInr, formatSpeed } from "@/lib/format";
import { getImportReport, listChargeCatalogue, listDiscountCatalogue, listPlans } from "@/lib/queries";

export const metadata = { title: "Catalogue" };

const TABS = [
  { id: "plan", label: "Internet Plan" },
  { id: "charge", label: "One-time charge" },
  { id: "discount", label: "Promo & Discounts" },
] as const;

const KIND_LABEL: Record<string, string> = {
  router: "Router",
  installation: "Installation",
  service: "Service",
  other: "Other",
};

function tabOf(value: string | undefined) {
  return TABS.some((item) => item.id === value) ? (value as (typeof TABS)[number]["id"]) : "plan";
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; edit?: string; batch?: string; tab?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const tab = tabOf(query.tab);
  const plans = listPlans(session.providerId);
  const charges = listChargeCatalogue(session.providerId);
  const discounts = listDiscountCatalogue(session.providerId);
  const editingPlan = tab === "plan" ? plans.find((plan) => String(plan.id) === query.edit) ?? null : null;
  const editingCharge = tab === "charge" ? charges.find((item) => String(item.id) === query.edit) ?? null : null;
  const editingDiscount = tab === "discount" ? discounts.find((item) => String(item.id) === query.edit) ?? null : null;
  const report =
    getImportReport(session.providerId, query.batch ? Number(query.batch) : undefined, "catalogue") ??
    (query.batch ? null : getImportReport(session.providerId, undefined, "plans"));

  function appliesLabel(value: string) {
    if (value.startsWith("plan:")) {
      const plan = plans.find((item) => String(item.id) === value.slice(5));
      return plan ? plan.name : "Internet plan";
    }
    if (value === "invoice") return "Full invoice";
    return KIND_LABEL[value] ? `${KIND_LABEL[value]} charge` : value;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Catalogue</h1>
          <p>Internet plans, one-time charges, and promos are saved here before they are added to an account.</p>
        </div>
        <a className="btn" href="/provider/plans/template">
          Download template
        </a>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <nav className="catalogue-tabs">
        {TABS.map((item) => (
          <Link key={item.id} href={`/provider/plans?tab=${item.id}`} className={tab === item.id ? "active" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <section className="split">
        <article className="card">
          {tab === "plan" ? (
            <>
              <h2>{editingPlan ? `Edit ${editingPlan.name}` : "New internet plan"}</h2>
              {editingPlan ? (
                <p className="fine" style={{ marginTop: -6, marginBottom: 12 }}>
                  <Link href="/provider/plans?tab=plan">Add a new plan instead</Link>
                </p>
              ) : null}
              <form action={savePlan} className="stack">
                {editingPlan ? <input type="hidden" name="plan_id" value={editingPlan.id} /> : null}
                <label className="field">
                  <span>Name</span>
                  <input name="name" required defaultValue={editingPlan?.name ?? ""} placeholder="Home 200" />
                </label>
                <div className="row-2">
                  <label className="field">
                    <span>Speed (Mbps)</span>
                    <input name="speed_mbps" type="number" min={1} required defaultValue={editingPlan?.speed_mbps ?? ""} placeholder="200" />
                  </label>
                  <label className="field">
                    <span>Monthly price (₹)</span>
                    <input name="price" type="number" min={1} required defaultValue={editingPlan?.price ?? ""} placeholder="799" />
                  </label>
                </div>
                <label className="field">
                  <span>Data</span>
                  <input name="data_cap" defaultValue={editingPlan?.data_cap ?? "Unlimited"} />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea name="description" defaultValue={editingPlan?.description ?? ""} placeholder="Who this plan is for." />
                </label>
                <SubmitButton pendingLabel={editingPlan ? "Saving…" : "Adding…"}>{editingPlan ? "Save plan" : "Add plan"}</SubmitButton>
              </form>
            </>
          ) : null}
          {tab === "charge" ? (
            <>
              <h2>{editingCharge ? `Edit ${editingCharge.name}` : "New one-time charge"}</h2>
              {editingCharge ? (
                <p className="fine" style={{ marginTop: -6, marginBottom: 12 }}>
                  <Link href="/provider/plans?tab=charge">Add a new charge instead</Link>
                </p>
              ) : null}
              <form action={saveChargeCatalogue} className="stack">
                {editingCharge ? <input type="hidden" name="charge_id" value={editingCharge.id} /> : null}
                <label className="field">
                  <span>Name</span>
                  <input name="name" required maxLength={40} defaultValue={editingCharge?.name ?? ""} placeholder="ONU router" />
                </label>
                <div className="row-2">
                  <label className="field">
                    <span>Type</span>
                    <select name="kind" defaultValue={editingCharge?.kind ?? "router"}>
                      <option value="router">Router</option>
                      <option value="installation">Installation</option>
                      <option value="service">Service</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Amount (₹)</span>
                    <input name="amount" type="number" min={1} required defaultValue={editingCharge?.amount ?? ""} placeholder="1500" />
                  </label>
                </div>
                <div className="row-2">
                  <CatalogueTaxFields included={!editingCharge || editingCharge.tax_included !== 0} percent={editingCharge?.tax_percent ?? 0} />
                </div>
                <SubmitButton pendingLabel={editingCharge ? "Saving…" : "Adding…"}>{editingCharge ? "Save charge" : "Add charge"}</SubmitButton>
              </form>
            </>
          ) : null}
          {tab === "discount" ? (
            <>
              <h2>{editingDiscount ? `Edit ${editingDiscount.name}` : "New promo or discount"}</h2>
              {editingDiscount ? (
                <p className="fine" style={{ marginTop: -6, marginBottom: 12 }}>
                  <Link href="/provider/plans?tab=discount">Add a new promo instead</Link>
                </p>
              ) : null}
              <form action={saveDiscountCatalogue} className="stack">
                {editingDiscount ? <input type="hidden" name="discount_id" value={editingDiscount.id} /> : null}
                <label className="field">
                  <span>Name</span>
                  <input name="name" required maxLength={40} defaultValue={editingDiscount?.name ?? ""} placeholder="Install waiver" />
                </label>
                <div className="row-2">
                  <DiscountAppliesFields
                    plans={plans.map((plan) => ({ id: plan.id, name: plan.name, speed_mbps: plan.speed_mbps, price: plan.price }))}
                    applies={editingDiscount?.applies_to ?? ""}
                    frequency={editingDiscount?.frequency ?? "recurring"}
                  />
                </div>
                <div className="row-2">
                  <label className="field">
                    <span>Mode</span>
                    <select name="mode" defaultValue={editingDiscount?.mode ?? "percent"}>
                      <option value="amount">Amount (₹)</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Value</span>
                    <input name="value" type="number" min={1} required defaultValue={editingDiscount?.value ?? ""} placeholder="10" />
                  </label>
                </div>
                <SubmitButton pendingLabel={editingDiscount ? "Saving…" : "Adding…"}>
                  {editingDiscount ? "Save promo" : "Add promo"}
                </SubmitButton>
              </form>
            </>
          ) : null}
        </article>
        <article className="card">
          <h2>Import catalogue</h2>
          <p className="fine" style={{ marginBottom: 12 }}>
            The template is one spreadsheet with three tabs: Internet Plan, One-time charge, and Promo &amp; Discounts. Fill any of them and upload the file. A name that already exists is skipped.
          </p>
          <form action={importCatalogue} className="stack">
            <input type="hidden" name="tab" value={tab} />
            <label className="field">
              <span>Spreadsheet file</span>
              <input type="file" name="workbook" accept=".xlsx,.csv,text/csv" />
            </label>
            <label className="field">
              <span>Or paste a plan CSV</span>
              <textarea name="csv" placeholder="name,speed,price,data,description" />
            </label>
            <SubmitButton pendingLabel="Importing…">Import catalogue</SubmitButton>
          </form>
          <div style={{ marginTop: 16 }}>
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
          </div>
        </article>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>{TABS.find((item) => item.id === tab)?.label}</h2>
        {tab === "plan" ? (
          plans.length === 0 ? (
            <p className="fine">No internet plans yet. Add one above, or import the spreadsheet.</p>
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
                        <Link href={`/provider/plans?tab=plan&edit=${plan.id}`}>Edit</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {tab === "charge" ? (
          charges.length === 0 ? (
            <p className="fine">No one-time charges yet. Add one above, or import the spreadsheet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th className="num">Amount</th>
                    <th>Tax</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{KIND_LABEL[item.kind] ?? item.kind}</td>
                      <td className="num">{formatInr(item.amount)}</td>
                      <td>{item.tax_included !== 0 || item.tax_percent <= 0 ? "Included" : `${item.tax_percent}%`}</td>
                      <td>
                        <Link href={`/provider/plans?tab=charge&edit=${item.id}`}>Edit</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {tab === "discount" ? (
          discounts.length === 0 ? (
            <p className="fine">No promos or discounts yet. Add one above, or import the spreadsheet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Applies to</th>
                    <th>Frequency</th>
                    <th>Value</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{appliesLabel(item.applies_to)}</td>
                      <td>{item.frequency === "once" ? "One time" : "Always with Internet Plan"}</td>
                      <td>{item.mode === "percent" ? `${item.value}%` : formatInr(item.value)}</td>
                      <td>
                        <Link href={`/provider/plans?tab=discount&edit=${item.id}`}>Edit</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </article>
    </>
  );
}
