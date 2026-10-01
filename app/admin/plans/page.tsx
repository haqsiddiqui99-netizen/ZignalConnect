import { savePlan } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatInr, formatSpeed } from "@/lib/format";
import { listPlans } from "@/lib/queries";

export const metadata = { title: "Plans" };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const plans = listPlans(session.providerId);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Plans</h1>
          <p>Price changes apply the next time a subscriber pays. Current renewal dates stay where they are.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="plan-grid">
        {plans.map((plan) => (
          <article className="card" key={plan.id}>
            <p className="fine">
              {plan.subscribers} subscriber{plan.subscribers === 1 ? "" : "s"} · {formatSpeed(plan.speed_mbps)} · {formatInr(plan.price)}
            </p>
            <form action={savePlan} className="stack" style={{ marginTop: 12 }}>
              <input type="hidden" name="plan_id" value={plan.id} />
              <label className="field">
                <span>Name</span>
                <input name="name" required defaultValue={plan.name} />
              </label>
              <div className="row-2">
                <label className="field">
                  <span>Speed (Mbps)</span>
                  <input name="speed_mbps" type="number" min={1} required defaultValue={plan.speed_mbps} />
                </label>
                <label className="field">
                  <span>Monthly price (₹)</span>
                  <input name="price" type="number" min={1} required defaultValue={plan.price} />
                </label>
              </div>
              <label className="field">
                <span>Data</span>
                <input name="data_cap" defaultValue={plan.data_cap} />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea name="description" defaultValue={plan.description} />
              </label>
              <SubmitButton className="btn small">Save plan</SubmitButton>
            </form>
          </article>
        ))}
        <article className="card">
          <h2>New plan</h2>
          <form action={savePlan} className="stack">
            <label className="field">
              <span>Name</span>
              <input name="name" required placeholder="Home 200" />
            </label>
            <div className="row-2">
              <label className="field">
                <span>Speed (Mbps)</span>
                <input name="speed_mbps" type="number" min={1} required placeholder="200" />
              </label>
              <label className="field">
                <span>Monthly price (₹)</span>
                <input name="price" type="number" min={1} required placeholder="799" />
              </label>
            </div>
            <label className="field">
              <span>Data</span>
              <input name="data_cap" defaultValue="Unlimited" />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea name="description" placeholder="Who this plan is for." />
            </label>
            <SubmitButton>Add plan</SubmitButton>
          </form>
        </article>
      </section>
    </>
  );
}
