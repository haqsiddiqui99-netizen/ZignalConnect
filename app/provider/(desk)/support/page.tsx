import { raiseSupport } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import { deskMobile, listSupport } from "@/lib/queries";

export const metadata = { title: "Zignal support" };

const STATUS: Record<string, string> = {
  open: "Open",
  in_progress: "Being looked at",
  resolved: "Resolved",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const tickets = listSupport({ providerId: session.providerId });
  const mobile = deskMobile(session.uid) || session.supportPhone;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Zignal support</h1>
          <p>Message the Zignal Connect team, and leave a mobile number they can call.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>New message</h2>
          <form action={raiseSupport} className="stack">
            <label className="field">
              <span>Mobile</span>
              <input name="mobile" inputMode="numeric" required defaultValue={mobile} placeholder="10-digit mobile" />
            </label>
            <label className="field">
              <span>What you need</span>
              <textarea name="message" required minLength={8} maxLength={800} rows={4} placeholder="Billing question, a bug, or help with a subscriber." />
            </label>
            <SubmitButton className="btn" pendingLabel="Sending…">
              Send to Zignal
            </SubmitButton>
          </form>
        </article>
        <article className="card">
          <h2>Your messages</h2>
          {tickets.length === 0 ? (
            <p>None yet.</p>
          ) : (
            <div className="list">
              {tickets.map((ticket) => (
                <div key={ticket.id}>
                  <strong>{ticket.sender_name}</strong>
                  <div className="fine">
                    {STATUS[ticket.status] ?? ticket.status} · {ticket.mobile} · {formatStamp(ticket.created_at)}
                  </div>
                  <p>{ticket.message}</p>
                  {ticket.reply ? <p className="fine">Zignal: {ticket.reply}</p> : null}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
