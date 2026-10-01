import { changeProductPlan, saveBrand } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CATALOG, allows, limitLabel, type ProductPlan } from "@/lib/entitlements";
import { formatInr } from "@/lib/format";
import { getUsage } from "@/lib/queries";

export const metadata = { title: "Upgrade" };

const FEATURES: { label: string; plans: ProductPlan[] }[] = [
  { label: "Subscriber desk, plans, and manual payments", plans: ["free", "pro", "ultra", "premium"] },
  { label: "Subscribers raise connectivity complaints online", plans: ["free", "pro", "ultra", "premium"] },
  { label: "Import customers from a spreadsheet", plans: ["free", "pro", "ultra", "premium"] },
  { label: "Your ISP name on the subscriber portal", plans: ["pro", "ultra", "premium"] },
  { label: "Renewal reminders at 3 days, 1 day, and the due date", plans: ["pro", "ultra", "premium"] },
  { label: "Email renewal reminders", plans: ["pro", "ultra", "premium"] },
  { label: "Collection report and export", plans: ["pro", "ultra", "premium"] },
  { label: "8 staff logins", plans: ["pro"] },
  { label: "20 staff logins", plans: ["ultra"] },
  { label: "Unlimited staff", plans: ["premium"] },
  { label: "Logo on the portal", plans: ["ultra", "premium"] },
  { label: "SMS and WhatsApp reminders", plans: ["ultra", "premium"] },
  { label: "Subscribers pay renewal online", plans: ["ultra", "premium"] },
  { label: "Areas or branches", plans: ["ultra", "premium"] },
  { label: "No customer cap", plans: ["premium"] },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const usage = getUsage(session.providerId);
  const provider = usage.provider;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Desk plan</h1>
          <p>
            {session.brandName} is on {usage.catalog.label}. {usage.customers} customers, {usage.staff} staff.
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <p className="fine" style={{ marginBottom: 12 }}>
        Choosing a plan switches this desk immediately. Collecting the monthly fee from a card is not connected yet.
      </p>
      <section className="plan-pick">
        {(Object.keys(CATALOG) as ProductPlan[]).map((plan) => {
          const item = CATALOG[plan];
          const current = plan === usage.plan;
          return (
            <article className={current ? "card current" : "card"} key={plan}>
              <p className="fine">{current ? "Current plan" : "Switch to"}</p>
              <h2>{item.label}</h2>
              <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
                {item.price === 0 ? "₹0" : formatInr(item.price)}
              </p>
              <p className="fine">{item.price === 0 ? "to start" : "per month"}</p>
              <p style={{ margin: "10px 0" }}>{item.blurb}</p>
              <p className="fine">
                {limitLabel(item.customers)} customers · {limitLabel(item.staff)} staff
              </p>
              <ul className="fine" style={{ paddingLeft: 18 }}>
                {FEATURES.filter((feature) => feature.plans.includes(plan)).map((feature) => (
                  <li key={feature.label}>{feature.label}</li>
                ))}
              </ul>
              {current || !session.isOwner ? null : (
                <form action={changeProductPlan}>
                  <input type="hidden" name="product_plan" value={plan} />
                  <SubmitButton className="btn small" pendingLabel="Switching…">
                    Use {item.label}
                  </SubmitButton>
                </form>
              )}
              {!current && !session.isOwner ? <p className="fine">Only the owner can switch plans.</p> : null}
            </article>
          );
        })}
      </section>
      <article className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <h2>ISP details</h2>
        <p className="fine" style={{ marginBottom: 12 }}>
          {allows(session.productPlan, "customBrand")
            ? "Subscribers see this name on their portal."
            : "On Free, subscribers still see Zignal. Pro, Ultra, and Premium show your ISP name."}
        </p>
        {session.isOwner ? (
          <form action={saveBrand} className="stack">
            <label className="field">
              <span>ISP name</span>
              <input name="isp_name" required defaultValue={provider?.name ?? ""} />
            </label>
            <label className="field">
              <span>Support mobile</span>
              <input name="support_phone" defaultValue={provider?.support_phone ?? ""} />
            </label>
            {allows(session.productPlan, "logo") ? (
              <label className="field">
                <span>Logo letters</span>
                <input name="logo_letter" maxLength={2} defaultValue={provider?.logo_letter ?? ""} placeholder="HF" />
              </label>
            ) : (
              <p className="fine">A short logo mark is part of Ultra and Premium.</p>
            )}
            <SubmitButton className="btn small">Save ISP details</SubmitButton>
          </form>
        ) : (
          <div className="stack">
            <label className="field">
              <span>ISP name</span>
              <input defaultValue={provider?.name ?? ""} disabled readOnly />
            </label>
            <label className="field">
              <span>Support mobile</span>
              <input defaultValue={provider?.support_phone ?? ""} disabled readOnly />
            </label>
            {allows(session.productPlan, "logo") ? (
              <label className="field">
                <span>Logo letters</span>
                <input defaultValue={provider?.logo_letter ?? ""} disabled readOnly />
              </label>
            ) : null}
            <p className="fine">Only the owner can update the ISP name and support mobile.</p>
          </div>
        )}
      </article>
    </>
  );
}
