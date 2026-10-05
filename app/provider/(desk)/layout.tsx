import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { CATALOG } from "@/lib/entitlements";
import { listChargeCatalogue, listDiscountCatalogue, listPlans } from "@/lib/queries";
import { issueRenewalReminders } from "@/lib/renewals";
import { AdminNav } from "@/components/admin-nav";
import { BrandMark } from "@/components/brand-mark";
import { DeskChat } from "@/components/desk-chat";
import { SubmitButton } from "@/components/submit-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  issueRenewalReminders(session.providerId);
  const plans = listPlans(session.providerId);
  const charges = listChargeCatalogue(session.providerId);
  const discounts = listDiscountCatalogue(session.providerId);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <strong>ZIGNAL</strong>
            <span>Connect · {session.brandName}</span>
          </div>
        </div>
        <AdminNav />
        <form action={logout} className="side-foot">
          <div>
            <strong>{session.name}</strong>
            <div className="fine">{CATALOG[session.productPlan].label} desk</div>
          </div>
          <SubmitButton className="btn small" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </aside>
      <div className="app-main">{children}</div>
      <DeskChat
        plans={plans.length}
        planNames={plans.map((plan) => plan.name).join(", ")}
        charges={charges.length}
        chargeNames={charges.map((charge) => charge.name).join(", ")}
        discounts={discounts.length}
        discountNames={discounts.map((discount) => discount.name).join(", ")}
        planLabel={CATALOG[session.productPlan].label}
        planPrice={CATALOG[session.productPlan].price}
        planCustomers={CATALOG[session.productPlan].customers}
        planStaff={CATALOG[session.productPlan].staff}
        planReminders={CATALOG[session.productPlan].reminders}
      />
    </div>
  );
}
