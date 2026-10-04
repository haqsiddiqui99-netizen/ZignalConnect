import { raiseComplaint } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { complaintCode } from "@/lib/complaints";
import { formatStamp } from "@/lib/format";
import { getSubscriberByUserId, listComplaints } from "@/lib/queries";
import { notFound } from "next/navigation";

export const metadata = { title: "Complaints" };

const CATEGORIES = [
  { id: "no_internet", label: "No internet" },
  { id: "slow", label: "Slow connection" },
  { id: "drops", label: "Connection drops" },
  { id: "other", label: "Other connectivity issue" },
];

const STATUS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  pending: "Pending",
  resolved: "Resolved",
  open: "New",
  in_progress: "Assigned",
};

export default async function PortalComplaints({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("customer");
  const query = await searchParams;
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const tickets = listComplaints({ customerId: person.id });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Complaints</h1>
          <p>Tell your provider about no internet, a slow line, or a connection that keeps dropping.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="split">
        <article className="card">
          <h2>Raise a complaint</h2>
          <form action={raiseComplaint} className="stack">
            <label className="field">
              <span>What is wrong</span>
              <select name="category" required defaultValue="no_internet">
                {CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>What you are seeing</span>
              <textarea name="details" required minLength={8} maxLength={500} rows={4} placeholder="Since this morning the line has no internet." />
            </label>
            <SubmitButton className="btn" pendingLabel="Sending…">
              Send complaint
            </SubmitButton>
          </form>
        </article>
        <article className="card">
          <h2>Your complaints</h2>
          {tickets.length === 0 ? (
            <p>None yet.</p>
          ) : (
            <div className="list">
              {tickets.map((ticket) => (
                <div key={ticket.id}>
                  <strong>{complaintCode(ticket.id)}</strong>
                  <div>
                    {CATEGORIES.find((item) => item.id === ticket.category)?.label ?? ticket.category}
                  </div>
                  <div className="fine">
                    {STATUS[ticket.status] ?? ticket.status} · {formatStamp(ticket.created_at)}
                  </div>
                  <p>{ticket.details}</p>
                  {ticket.provider_note ? <p className="fine">Provider: {ticket.provider_note}</p> : null}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
