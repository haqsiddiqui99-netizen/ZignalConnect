import { changeDeskPassword, saveDeskSettings } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { deskMobile } from "@/lib/queries";

export const metadata = { title: "Settings" };

export default async function DeskSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const mobile = deskMobile(session.uid);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your name, mobile, theme, and password for this desk.</p>
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
    </>
  );
}
