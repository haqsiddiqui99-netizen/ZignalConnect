import { logout } from "@/lib/actions";
import { clearSession, requireRole } from "@/lib/auth";
import { settleDesk } from "@/lib/desk-close";
import { formatDate } from "@/lib/format";
import { redirect } from "next/navigation";
import { CATALOG } from "@/lib/entitlements";
import { listChargeCatalogue, listDiscountCatalogue, listPlans } from "@/lib/queries";
import { AdminNav } from "@/components/admin-nav";
import { BrandMark } from "@/components/brand-mark";
import { DeskChat } from "@/components/desk-chat";
import { SubmitButton } from "@/components/submit-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  const quit = settleDesk(session.providerId);
  if (quit.phase === "closed") {
    await clearSession();
    redirect(`/?error=${encodeURIComponent(`This desk closed on ${formatDate(quit.closedAt)}. Sign-in has stopped.`)}`);
  }
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
      <div className="app-main">
        {quit.phase === "waiting" || quit.phase === "scheduled" ? (
          <p className="quit-banner">
            {quit.phase === "waiting"
              ? `This desk was set to close on ${formatDate(quit.quitOn)}. That day has arrived, so it can no longer be re-opened. It stays open until ${quit.open.length} payment${quit.open.length === 1 ? "" : "s"} ${quit.open.length === 1 ? "is" : "are"} closed.`
              : `This desk is set to close on ${formatDate(quit.quitOn)}. You can re-open it before that day.`}{" "}
            {session.isOwner ? <a href="/provider/settings">Review it in Settings.</a> : "Only the owner can re-open it."}
          </p>
        ) : null}
        {children}
      </div>
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
