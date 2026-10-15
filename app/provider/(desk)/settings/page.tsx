import {
  changeDeskPassword,
  removeCollectBank,
  saveCollectBank,
  saveCollectUpi,
  saveDeskPayment,
  saveDeskSettings,
  saveLineLink,
  saveReminderMessages,
} from "@/lib/actions";
import { DeskQuitPanel } from "@/components/desk-quit";
import { requireRole } from "@/lib/auth";
import { settleDesk } from "@/lib/desk-close";
import { NetworkBoxFields } from "@/components/network-box";
import { SavedPaymentFields } from "@/components/saved-payment";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { REMINDER_DEFAULTS } from "@/lib/renewals";
import { formatStamp } from "@/lib/format";
import { collectLine, deskMobile, getProvider, maskAccount, type ProviderRecord } from "@/lib/queries";

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
          <p>Your name, mobile, theme, password, the network box, payment preference, how subscribers pay, the two renewal reminders, and closing this desk.</p>
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
            {session.isOwner ? (
              <label className="field">
                <span>Sign-in code</span>
                <select name="otp_via" defaultValue={provider?.otp_via === "whatsapp" ? "whatsapp" : "email"}>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <p className="fine">After the password, the 6-digit code goes to the sign-in email, or to the mobile above on WhatsApp.</p>
              </label>
            ) : null}
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
      <article className="card">
        <h2>Network box</h2>
        <ul className="fine info-list">
          <li>Choose MikroTik when you have a router address, username, and password. The port is 8728.</li>
          <li>Choose RADIUS only when you also have a database name. The port is 3306.</li>
          <li>Active turns the line on. Paused, Disconnect, Collection, and Write off turn it off.</li>
          <li>Use an address this website can reach. Leave this blank and the desk still saves the status.</li>
        </ul>
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
      <article className="card">
        <h2>Payment saved details</h2>
        <p className="fine">
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
      <article className="card">
        <h2>Collect from subscribers</h2>
        <p className="fine">
          This decides what the subscriber Pay page shows. Nothing saved: cash only. A UPI ID: UPI and cash. A bank account: credit card, debit
          card, net banking, UPI, and cash, once the payment gateway approves it. Money from subscribers goes to this ISP, not to Zignal.
        </p>
        <p className="collect-now">
          <span>Subscribers see now</span>
          <strong>{collectLine(provider)}</strong>
        </p>
        <h3 className="collect-saved-head">Saved details</h3>
        <dl className="fact-grid collect-saved">
          <SavedFact label="UPI ID" value={provider?.collect_upi ?? ""} />
          <SavedFact label="Payee name" value={provider?.collect_upi ? provider.collect_payee : ""} />
          <SavedFact label="Account holder" value={provider?.bank_holder ?? ""} />
          <SavedFact label="Account number" value={maskAccount(provider?.bank_account ?? "")} />
          <SavedFact label="IFSC" value={provider?.bank_ifsc ?? ""} />
          <SavedFact label="PAN" value={provider?.bank_pan ?? ""} />
          <SavedFact label="Bank status" value={provider?.bank_account ? bankStatusLabel(provider.bank_status) : ""} />
          <SavedFact label="Bank changed" value={provider?.bank_changed_at ? formatStamp(provider.bank_changed_at) : ""} />
        </dl>
        {session.isOwner ? (
          <div className="collect-grid">
            <form action={saveCollectUpi} className="stack collect-part">
              <h3>UPI</h3>
              <p className="fine">
                Use a business UPI ID. The subscriber pays it directly, then enters the UPI reference. You confirm it on Overview after checking the bank.
              </p>
              <label className="field">
                <span>UPI ID</span>
                <input name="collect_upi" defaultValue={provider?.collect_upi ?? ""} placeholder="harbourfiber@okhdfcbank" autoComplete="off" inputMode="email" />
              </label>
              <label className="field">
                <span>Payee name</span>
                <input name="collect_payee" defaultValue={provider?.collect_payee || session.brandName} maxLength={60} />
              </label>
              <p className="fine">Leave the UPI ID blank and save to remove UPI.</p>
              <SubmitButton className="btn small">Save UPI</SubmitButton>
            </form>
            <div className="stack collect-part">
              <h3>Bank account</h3>
              <p className="fine">
                Card and net-banking payments are paid out to this account by the payment gateway. The owner gets an email when it changes.
              </p>
              <form action={saveCollectBank} className="stack">
                <label className="field">
                  <span>Account holder name</span>
                  <input name="bank_holder" required maxLength={80} defaultValue={provider?.bank_holder ?? ""} placeholder="As the bank shows it" />
                </label>
                <div className="row-2">
                  <label className="field">
                    <span>Account number</span>
                    <input
                      name="bank_account"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={18}
                      placeholder={provider?.bank_account ? "Saved. Leave blank to keep it." : "9 to 18 digits"}
                    />
                  </label>
                  <label className="field">
                    <span>Confirm account number</span>
                    <input name="bank_account_confirm" inputMode="numeric" autoComplete="off" maxLength={18} />
                  </label>
                </div>
                <div className="row-2">
                  <label className="field">
                    <span>IFSC</span>
                    <input name="bank_ifsc" required maxLength={11} defaultValue={provider?.bank_ifsc ?? ""} placeholder="HDFC0001234" />
                  </label>
                  <label className="field">
                    <span>PAN</span>
                    <input name="bank_pan" required maxLength={10} defaultValue={provider?.bank_pan ?? ""} placeholder="ABCDE1234F" />
                  </label>
                </div>
                <p className="fine">GSTIN on payouts: {provider?.gstin || "none saved"}. It is changed under Upgrade, with the ISP details.</p>
                <SubmitButton className="btn small">Save bank account</SubmitButton>
              </form>
              {provider?.bank_account ? (
                <form action={removeCollectBank}>
                  <button className="btn small" type="submit">
                    Remove bank account
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="fine">The owner of this desk can change these details.</p>
        )}
      </article>
      <article className="card">
        <h2>Renewal reminders</h2>
        <p className="fine">
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
      <DeskQuitPanel owner={session.isOwner} quit={settleDesk(session.providerId)} />
    </>
  );
}

function networkSummary(provider: ProviderRecord | undefined) {
  if (provider?.line_kind === "mikrotik") return `MikroTik · ${provider.line_host || "address not set"}. The owner can change this.`;
  if (provider?.line_kind === "radius") return `RADIUS · ${provider.line_host || "address not set"}. The owner can change this.`;
  return "No network box is connected. The owner of this desk can add MikroTik or RADIUS.";
}

function SavedFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "Not added"}</dd>
    </div>
  );
}

function bankStatusLabel(status: string) {
  return status === "active" ? "Active" : "Waiting for the payment gateway";
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
