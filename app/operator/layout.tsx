import { logout } from "@/lib/actions";
import { requireOperator } from "@/lib/auth";
import { OperatorNav } from "@/components/operator-nav";
import { SubmitButton } from "@/components/submit-button";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOperator();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">Z</div>
          <div>
            <strong>ZIGNAL</strong>
            <span>Connect · operators</span>
          </div>
        </div>
        <OperatorNav />
        <form action={logout} className="side-foot">
          <div>
            <strong>{session.name}</strong>
            <div className="fine">{session.email}</div>
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
