import { openUpgradeCheckout, saveBrand } from "@/lib/actions";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CATALOG, PLAN_POINTS, allows, limitLabel, overflowLimit, planFamily, type ProductPlan } from "@/lib/entitlements";
import { formatDate, formatInr } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/tax";
import { getUsage } from "@/lib/queries";

export const metadata = { title: "Upgrade" };

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
            {session.brandName} is on {planFamily(usage.plan) === "premium" ? "Premium" : usage.catalog.label}.{" "}
            {usage.customers} customers, {usage.staff} staff.
            {usage.subscriberBase > 0 ? ` Registered book: ${usage.subscriberBase}.` : ""}
            {usage.trial.active ? ` Trial runs until ${formatDate(usage.trial.ends)} (${usage.trial.daysLeft} days left).` : ""}
            {usage.trial.ended ? ` Trial ended on ${formatDate(usage.trial.ends)}.` : ""}
            {usage.overage > 0
              ? ` ${usage.overage} subscribers are over the ${limitLabel(usage.customerCap)} cap (${formatInr(usage.overageDue)} at ₹3 each).`
              : ""}
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <p className="fine" style={{ marginBottom: 12 }}>
        Upgrade opens a payment page for that plan. The monthly fee, the ₹3 overflow, and extra messages at ₹0.50 are
        prices on the plan. The payment gateway is the only piece still to connect.
      </p>
      <section className="plan-pick">
        {(["pro", "ultra"] as ProductPlan[]).map((plan) => {
          const item = CATALOG[plan];
          const current = plan === usage.plan;
          const tooSmall = usage.customers > item.customers || usage.staff > item.staff;
          return (
            <article className={current ? "card current" : "card"} key={plan}>
              <p className="fine">{current ? "Current plan" : "Switch to"}</p>
              <h2>{item.label}</h2>
              <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
                {formatInr(item.price)}
              </p>
              <p className="fine">per month</p>
              <p style={{ margin: "10px 0" }}>{item.blurb}</p>
              <p className="fine">
                {limitLabel(item.customers)} customers · {limitLabel(item.reminders)} reminders · {limitLabel(item.staff)}{" "}
                staff · {item.trialDays}-day trial
              </p>
              <p className="fine">Overflow to {limitLabel(overflowLimit(plan))} at ₹3 each. Extra messages ₹0.50.</p>
              <ul className="fine" style={{ paddingLeft: 18 }}>
                {PLAN_POINTS.filter((feature) => feature.plans.includes(planFamily(plan))).map((feature) => (
                  <li key={feature.label}>{feature.label}</li>
                ))}
              </ul>
              {current || !session.isOwner ? null : tooSmall ? (
                <p className="fine">This desk is larger than {item.label}.</p>
              ) : (
                <form action={openUpgradeCheckout}>
                  <input type="hidden" name="product_plan" value={plan} />
                  <SubmitButton className="btn small" pendingLabel="Opening payment…">
                    Upgrade
                  </SubmitButton>
                </form>
              )}
              {!current && !session.isOwner ? <p className="fine">Only the owner can switch plans.</p> : null}
            </article>
          );
        })}
        <article className={planFamily(usage.plan) === "premium" ? "card current" : "card"}>
          <p className="fine">{planFamily(usage.plan) === "premium" ? "Current plan" : "Upgrade to"}</p>
          <h2>Premium</h2>
          <p className="hero-price" style={{ color: "var(--ink)", fontSize: 36 }}>
            from {formatInr(CATALOG.premium_3000.price)}
          </p>
          <p className="fine">per month, set from the subscriber base</p>
          <p style={{ margin: "10px 0" }}>Unlimited staff. The rate is worked out when you upgrade.</p>
          <p className="fine">
            Up to {limitLabel(CATALOG.premium_30000.customers)} customers · unlimited staff ·{" "}
            {CATALOG.premium_3000.trialDays}-day trial
          </p>
          <p className="fine">Overflow at ₹3 each. Extra messages ₹0.50.</p>
          <ul className="fine" style={{ paddingLeft: 18 }}>
            {PLAN_POINTS.filter((feature) => feature.plans.includes("premium")).map((feature) => (
              <li key={feature.label}>{feature.label}</li>
            ))}
          </ul>
          {session.isOwner ? (
            <Link className="btn small" href="/provider/upgrade/premium">
              Upgrade
            </Link>
          ) : (
            <p className="fine">Only the owner can switch plans.</p>
          )}
        </article>
      </section>
      <article className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <h2>ISP details</h2>
        <p className="fine" style={{ marginBottom: 12 }}>
          Subscribers see this name on their portal. The GSTIN, address, and logo go on the receipts they download.
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
            <label className="field">
              <span>GSTIN</span>
              <input name="gstin" defaultValue={provider?.gstin ?? ""} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </label>
            <label className="field">
              <span>Address</span>
              <input name="address" defaultValue={provider?.address ?? ""} />
            </label>
            <div className="row-2">
              <label className="field">
                <span>City</span>
                <input name="city" defaultValue={provider?.city ?? ""} />
              </label>
              <label className="field">
                <span>State</span>
                <select name="state" defaultValue={provider?.state ?? ""}>
                  <option value="">Not set</option>
                  {INDIAN_STATES.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
              </label>
            </div>
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
