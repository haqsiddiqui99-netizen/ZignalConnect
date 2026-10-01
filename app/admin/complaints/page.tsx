import { updateComplaint } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import { listComplaints } from "@/lib/queries";
import Link from "next/link";

export const metadata = { title: "Complaints" };

const CATEGORIES: Record<string, string> = {
  no_internet: "No internet",
  slow: "Slow connection",
  drops: "Connection drops",
  other: "Other connectivity issue",
};

export default async function AdminComplaints({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const tickets = listComplaints({ providerId: session.providerId });
  const open = tickets.filter((ticket) => ticket.status !== "resolved").length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Complaints</h1>
          <p>
            {tickets.length} from subscribers · {open} still open.
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      {tickets.length === 0 ? (
        <article className="card">
          <p>No complaints yet. Subscribers file them from their portal.</p>
        </article>
      ) : (
        <div className="stack">
          {tickets.map((ticket) => (
            <article className="card" key={ticket.id}>
              <p className="fine">
                {formatStamp(ticket.created_at)} · {CATEGORIES[ticket.category] ?? ticket.category}
              </p>
              <h2>
                <Link className="rowlink" href={`/admin/customers/${ticket.customer_id}`}>
                  {ticket.customer_name}
                </Link>
              </h2>
              <p>{ticket.details}</p>
              <form action={updateComplaint} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="complaint_id" value={ticket.id} />
                <label className="field">
                  <span>Status</span>
                  <select name="status" defaultValue={ticket.status}>
                    <option value="open">Open</option>
                    <option value="in_progress">Being looked at</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label className="field">
                  <span>Note for the subscriber</span>
                  <textarea name="provider_note" maxLength={400} rows={2} defaultValue={ticket.provider_note} />
                </label>
                <SubmitButton className="btn small" pendingLabel="Saving…">
                  Update
                </SubmitButton>
              </form>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
