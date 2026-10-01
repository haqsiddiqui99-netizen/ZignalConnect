import { inviteStaff, reissueStaffPassword } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { limitLabel } from "@/lib/entitlements";
import { getUsage, listStaff } from "@/lib/queries";

export const metadata = { title: "Team" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const usage = getUsage(session.providerId);
  const staff = listStaff(session.providerId);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <p>
            {usage.staff} of {limitLabel(usage.staffCap)} staff logins on {usage.catalog.label}. Email, password, and
            mobile stay on this page so you can share them.
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>People with a desk login</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  {session.isOwner ? <th>Password</th> : null}
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id}>
                    <td>{person.name}</td>
                    <td>{person.mobile || "—"}</td>
                    <td>{person.email}</td>
                    {session.isOwner ? (
                      <td>
                        {person.is_owner ? (
                          "Set when this desk was opened"
                        ) : person.login_password ? (
                          person.login_password
                        ) : (
                          <form action={reissueStaffPassword}>
                            <input type="hidden" name="staff_id" value={person.id} />
                            <SubmitButton className="btn small" pendingLabel="Saving…">
                              Save a password
                            </SubmitButton>
                          </form>
                        )}
                      </td>
                    ) : null}
                    <td>{person.is_owner ? "Owner" : "Staff"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="card">
          <h2>Add staff</h2>
          {usage.staffSlots <= 0 ? (
            <p>This plan has no spare staff logins. Pro includes 8, Ultra includes 20, and Premium has no cap.</p>
          ) : session.isOwner ? (
            <form action={inviteStaff} className="stack">
              <label className="field">
                <span>Name</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>Mobile</span>
                <input name="mobile" inputMode="numeric" required placeholder="10-digit mobile" />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" required />
              </label>
              <SubmitButton>Create staff login</SubmitButton>
            </form>
          ) : (
            <p className="fine">Only the owner can add staff.</p>
          )}
        </article>
      </section>
    </>
  );
}
