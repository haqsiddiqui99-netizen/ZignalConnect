import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PortalNav } from "@/components/portal-nav";
import { SubmitButton } from "@/components/submit-button";
import { portalBrand } from "@/lib/entitlements";
import { issueRenewalReminders } from "@/lib/renewals";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("customer");
  issueRenewalReminders(session.providerId);
  const brand = portalBrand(session.productPlan, session.brandName, session.logoLetter);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">{brand.mark}</div>
          <div>
            <strong>{brand.title}</strong>
            <span>My connection</span>
          </div>
        </div>
        <PortalNav />
        <form action={logout} className="side-foot">
          <div>
            <strong>{session.name}</strong>
            <div className="fine">Subscriber</div>
          </div>
          <SubmitButton className="btn small" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
