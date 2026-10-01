import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { CATALOG } from "@/lib/entitlements";
import { issueRenewalReminders } from "@/lib/renewals";
import { AdminNav } from "@/components/admin-nav";
import { SubmitButton } from "@/components/submit-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  issueRenewalReminders(session.providerId);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">Z</div>
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
    </div>
  );
}
