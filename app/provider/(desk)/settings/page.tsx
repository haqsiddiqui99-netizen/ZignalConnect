import { changeDeskPassword, saveDeskPayment, saveDeskSettings, saveLineLink, saveReminderMessages } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { NetworkBoxFields } from "@/components/network-box";
import { SavedPaymentFields } from "@/components/saved-payment";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { REMINDER_DEFAULTS } from "@/lib/renewals";
import { deskMobile, getProvider, type ProviderRecord } from "@/lib/queries";

export const metadata = { title: "Settings" };

export default async function DeskSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const mobile = deskMobile(session.uid);
  const provider = getProvider(session.providerId);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your name, mobile, theme, password, the network box, payment preference, and the two renewal reminders.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>Your details</h2>
          <form action={saveDeskSettings} className="stack">
            <label className="field">
              <span>Name</span>
              <input name="name" required defaultValue={session.name} />
            </label>
            <label className="field">
              <span>Sign-in email</span>
              <input value={session.email} disabled readOnly />
            </label>
            <label className="field">
              <span>Mobile</span>
              <input name="mobile" inputMode="numeric" defaultValue={mobile} placeholder="10-digit mobile" />
            </label>
            <label className="field">
              <span>Theme</span>
              <select name="theme" defaultValue={session.theme}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <SubmitButton className="btn small">Save details</SubmitButton>
          </form>
        </article>
        <article className="card">
          <h2>Password</h2>
          <form action={changeDeskPassword} className="stack">
            <label className="field">
              <span>Current password</span>
              <input name="current_password" type="password" autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input name="new_password" type="password" autoComplete="new-password" required minLength={6} />
            </label>
            <label className="field">
              <span>Confirm</span>
              <input name="confirm_password" type="password" autoComplete="new-password" required minLength={6} />
            </label>
            <SubmitButton className="btn small">Update password</SubmitButton>
          </form>
        </article>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Network box</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          Connect MikroTik or RADIUS so a subscriber line follows the desk. Active turns it on. Paused, Disconnect, Collection, and Write off turn it off. The router API uses port 8728. RADIUS uses the database port, usually 3306, and a disconnect message on port 3799 when you add that secret. The desk reaches this address from the server. A box that only answers inside the office will not change the line until that address is reachable. The fiber box is not connected from this page. Without a network box, the desk still saves the status.
        </p>
        {session.isOwner ? (
          <NetworkBoxFields
            action={saveLineLink}
            kind={provider?.line_kind ?? ""}
            host={provider?.line_host ?? ""}
            port={provider?.line_port ?? 0}
            user={provider?.line_user ?? ""}
            hasSecret={Boolean(provider?.line_secret)}
            database={provider?.line_db ?? ""}
            hasCoa={Boolean(provider?.line_coa)}
          />
        ) : (
          <p>{networkSummary(provider)}</p>
        )}
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Payment saved details</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          Preferred way to pay Zignal for this desk. Saving a method does not charge a card, UPI, or bank account.
        </p>
        {session.isOwner ? (
          <form action={saveDeskPayment} className="stack">
            <SavedPaymentFields
              method={provider?.pay_method ?? ""}
              via={provider?.pay_via ?? ""}
              holder={provider?.pay_holder ?? ""}
              detail={provider?.pay_detail ?? ""}
              expiry={provider?.pay_expiry ?? ""}
            />
            <SubmitButton className="btn small">Save payment details</SubmitButton>
          </form>
        ) : (
          <p>{paymentSummary(provider)}</p>
        )}
      </article>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Renewal reminders</h2>
        <p className="fine" style={{ margin: "8px 0 16px" }}>
          One email goes 3 days before the due date, and one on the due date, even when nobody opens the desk. A copy
          stays on the subscriber portal. A line that is already paid does not get either note. Use {"{name}"}, {"{plan}"},{" "}
          {"{date}"}, {"{amount}"}, and {"{isp}"} where the subscriber's details should appear. A new subscriber also gets a
          welcome email with their sign-in details. Message and WhatsApp are not connected yet.
        </p>
        {session.isOwner ? (
          <form action={saveReminderMessages} className="stack">
            <label className="field">
              <span>3 days before — title</span>
              <input name="soon_title" required maxLength={80} defaultValue={provider?.reminder_soon_title || REMINDER_DEFAULTS.soonTitle} />
            </label>
            <label className="field">
              <span>3 days before — message</span>
              <textarea name="soon_body" required maxLength={400} rows={3} defaultValue={provider?.reminder_soon_body || REMINDER_DEFAULTS.soonBody} />
            </label>
            <label className="field">
              <span>Due date — title</span>
              <input name="due_title" required maxLength={80} defaultValue={provider?.reminder_due_title || REMINDER_DEFAULTS.dueTitle} />
            </label>
            <label className="field">
              <span>Due date — message</span>
              <textarea name="due_body" required maxLength={400} rows={3} defaultValue={provider?.reminder_due_body || REMINDER_DEFAULTS.dueBody} />
            </label>
            <SubmitButton className="btn small">Save reminder messages</SubmitButton>
          </form>
        ) : (
          <div className="stack">
            <p>
              <strong>{provider?.reminder_soon_title || REMINDER_DEFAULTS.soonTitle}</strong>
            </p>
            <p>{provider?.reminder_soon_body || REMINDER_DEFAULTS.soonBody}</p>
            <p>
              <strong>{provider?.reminder_due_title || REMINDER_DEFAULTS.dueTitle}</strong>
            </p>
            <p>{provider?.reminder_due_body || REMINDER_DEFAULTS.dueBody}</p>
          </div>
        )}
      </article>
    </>
  );
}

function networkSummary(provider: ProviderRecord | undefined) {
  if (provider?.line_kind === "mikrotik") return `MikroTik · ${provider.line_host || "address not set"}. The owner can change this.`;
  if (provider?.line_kind === "radius") return `RADIUS · ${provider.line_host || "address not set"}. The owner can change this.`;
  return "No network box is connected. The owner of this desk can add MikroTik or RADIUS.";
}

function paymentSummary(provider: ProviderRecord | undefined) {
  if (!provider?.pay_method) return "No payment method is saved yet. The owner of this desk can add one.";
  const via = provider.pay_method === "auto_pay" ? provider.pay_via : provider.pay_method;
  const kind =
    via === "credit_card" ? "Credit card" : via === "debit_card" ? "Debit card" : via === "upi" ? "UPI" : via === "net_banking" ? "Net banking" : "Payment method";
  const lead = provider.pay_method === "auto_pay" ? `Auto-pay · ${kind}` : kind;
  if (via === "credit_card" || via === "debit_card") {
    const tail = [provider.pay_holder, provider.pay_detail ? `•••• ${provider.pay_detail}` : "", provider.pay_expiry].filter(Boolean).join(" · ");
    return tail ? `${lead} · ${tail}` : lead;
  }
  if (via === "upi") return provider.pay_detail ? `${lead} · ${provider.pay_detail}` : lead;
  const bank = [provider.pay_detail, provider.pay_holder].filter(Boolean).join(" · ");
  return bank ? `${lead} · ${bank}` : lead;
}
