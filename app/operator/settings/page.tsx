import { changeOperatorPassword, saveOperatorSettings, savePlatformProfile } from "@/lib/actions";
import { requireOperator } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { getPlatformProfile } from "@/lib/queries";
import { INDIAN_STATES } from "@/lib/tax";

export const metadata = { title: "Settings" };

export default async function OperatorSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireOperator();
  const query = await searchParams;
  const company = getPlatformProfile();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your name, theme, and password for the Zignal Connect desk.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>Your details</h2>
          <form action={saveOperatorSettings} className="stack">
            <label className="field">
              <span>Name</span>
              <input name="name" required defaultValue={session.name} />
            </label>
            <label className="field">
              <span>Sign-in email</span>
              <input value={session.email} disabled readOnly />
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
          <form action={changeOperatorPassword} className="stack">
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
      <article className="card" style={{ marginTop: 14, maxWidth: 720 }}>
        <h2>Receipt details</h2>
        <p className="fine" style={{ marginBottom: 12 }}>
          These details are printed on the receipt a provider downloads after paying Zignal. Leave GSTIN blank until the
          business is registered. Tax is then added at 18% on new desk fees.
        </p>
        <form action={savePlatformProfile} className="stack">
          <label className="field">
            <span>Legal name</span>
            <input name="legal_name" required defaultValue={company.legal_name} />
          </label>
          <label className="field">
            <span>GSTIN</span>
            <input name="gstin" defaultValue={company.gstin} placeholder="22AAAAA0000A1Z5" maxLength={15} />
          </label>
          <label className="field">
            <span>Address</span>
            <input name="address" defaultValue={company.address} />
          </label>
          <div className="row-2">
            <label className="field">
              <span>City</span>
              <input name="city" defaultValue={company.city} />
            </label>
            <label className="field">
              <span>State</span>
              <select name="state" defaultValue={company.state}>
                <option value="">Not set</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-2">
            <label className="field">
              <span>Phone</span>
              <input name="phone" defaultValue={company.phone} />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" defaultValue={company.email} />
            </label>
          </div>
          <SubmitButton className="btn small">Save receipt details</SubmitButton>
        </form>
      </article>
    </>
  );
}
