import { saveBrand } from "@/lib/actions";
import { DeskPlanCards } from "@/components/desk-plan-cards";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { allows, isBillTerm, limitLabel, planFamily } from "@/lib/entitlements";
import { formatDate, formatInr } from "@/lib/format";
import { IspPincodeFields } from "@/components/service-address";
import { getUsage } from "@/lib/queries";
import { carriedOverflow, carriedStaffOverflow, syncDeskOverflow } from "@/lib/receipts";

export const metadata = { title: "Upgrade" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  syncDeskOverflow(session.providerId);
  const usage = getUsage(session.providerId);
  const unbilled = carriedOverflow(session.providerId);
  const unbilledStaff = carriedStaffOverflow(session.providerId);
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
            {usage.staffOverage > 0
              ? ` ${usage.staffOverage} staff ${usage.staffOverage === 1 ? "login is" : "logins are"} over the ${limitLabel(usage.staffCap)} included (${formatInr(usage.staffOverageDue)} at ₹10 each per month).`
              : ""}
            {unbilled > 0
              ? ` ${formatInr(unbilled)} of subscriber overflow was added after this month's invoice was paid. Next month's bill adds that amount, and another ₹3 for each overflow subscriber still on the book.`
              : ""}
            {unbilledStaff > 0
              ? ` ${formatInr(unbilledStaff)} of staff overflow was added after this month's invoice was paid.`
              : ""}
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <p className="fine" style={{ marginBottom: 12 }}>
        Upgrade opens a payment page for that plan. The desk fee follows the term you pick. The ₹3 subscriber overflow, extra staff at ₹10
        each, and extra messages at ₹0.50 stay monthly. The payment gateway is the only piece still to connect.
      </p>
      <DeskPlanCards
        currentPlan={usage.plan}
        currentTerm={usage.provider?.billing_term && isBillTerm(usage.provider.billing_term) ? usage.provider.billing_term : "monthly"}
        customers={usage.customers}
        isOwner={session.isOwner}
      />
      <article className="card" style={{ marginTop: 14 }}>
        <h2>ISP details</h2>
        <p className="fine" style={{ marginBottom: 12 }}>
          Subscribers see this name on their portal. The GSTIN, address, and logo go on the receipts they download.
        </p>
        {session.isOwner ? (
          <form action={saveBrand} className="stack">
            <div className="isp-line four">
              <label className="field">
                <span>ISP name</span>
                <input name="isp_name" required defaultValue={provider?.name ?? ""} />
              </label>
              <label className="field">
                <span>Logo letter</span>
                <input
                  name="logo_letter"
                  maxLength={2}
                  defaultValue={provider?.logo_letter ?? ""}
                  placeholder="HF"
                  disabled={!allows(session.productPlan, "logo")}
                />
              </label>
              <label className="field">
                <span>Support mobile</span>
                <input name="support_phone" defaultValue={provider?.support_phone ?? ""} />
              </label>
              <label className="field">
                <span>GSTIN</span>
                <input name="gstin" defaultValue={provider?.gstin ?? ""} placeholder="22AAAAA0000A1Z5" />
              </label>
            </div>
            <IspPincodeFields
              address={provider?.address ?? ""}
              pincode={provider?.pincode ?? ""}
              city={provider?.city ?? ""}
              state={provider?.state ?? ""}
              country={provider?.country || "India"}
            />
            {allows(session.productPlan, "logo") ? null : (
              <p className="fine">This desk plan does not include a logo mark.</p>
            )}
            <SubmitButton className="btn small">Save ISP details</SubmitButton>
          </form>
        ) : (
          <div className="stack">
            <div className="isp-line four">
              <label className="field">
                <span>ISP name</span>
                <input defaultValue={provider?.name ?? ""} disabled readOnly />
              </label>
              <label className="field">
                <span>Logo letter</span>
                <input defaultValue={provider?.logo_letter ?? ""} disabled readOnly />
              </label>
              <label className="field">
                <span>Support mobile</span>
                <input defaultValue={provider?.support_phone ?? ""} disabled readOnly />
              </label>
              <label className="field">
                <span>GSTIN</span>
                <input defaultValue={provider?.gstin ?? ""} disabled readOnly />
              </label>
            </div>
            <div className="row-2">
              <label className="field">
                <span>Address</span>
                <input defaultValue={provider?.address ?? ""} disabled readOnly />
              </label>
              <label className="field">
                <span>PIN code</span>
                <input defaultValue={provider?.pincode ?? ""} disabled readOnly />
              </label>
            </div>
            <div className="isp-line three">
              <label className="field">
                <span>City</span>
                <input defaultValue={provider?.city ?? ""} disabled readOnly />
              </label>
              <label className="field">
                <span>State</span>
                <input defaultValue={provider?.state ?? ""} disabled readOnly />
              </label>
              <label className="field">
                <span>Country</span>
                <input defaultValue={provider?.country || "India"} disabled readOnly />
              </label>
            </div>
            <p className="fine">Only the owner can update the ISP name and support mobile.</p>
          </div>
        )}
      </article>
    </>
  );
}
