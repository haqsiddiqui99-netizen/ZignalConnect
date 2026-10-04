import { raiseSupport } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { SupportFollowup } from "@/components/support-followup";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import { deskMobile, listSupport, listSupportFollowups, SUPPORT_PRIORITIES, SUPPORT_TOPICS, supportCode, type SupportFollowup as Followup } from "@/lib/queries";

export const metadata = { title: "Zignal Support" };

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
  const tickets = listSupport({ providerId: session.providerId }).slice().sort((a, b) => b.id - a.id);
  const notes = listSupportFollowups(tickets.map((ticket) => ticket.id));
  const notesByTicket = new Map<number, Followup[]>();
  for (const note of notes) {
    const list = notesByTicket.get(note.request_id) ?? [];
    list.push(note);
    notesByTicket.set(note.request_id, list);
  }
  const mobile = deskMobile(session.uid) || session.supportPhone;
  const open = tickets.filter((ticket) => ticket.status === "open").length;
  const progress = tickets.filter((ticket) => ticket.status === "in_progress").length;
  const resolved = tickets.filter((ticket) => ticket.status === "resolved").length;
  const highOpen = tickets.filter((ticket) => ticket.status !== "resolved" && ticket.priority === "high").length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Zignal Support</h1>
          <p>Message the Zignal Connect team, and leave a mobile number they can call.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="support-top">
        <article className="card">
          <h2>New message</h2>
          <form action={raiseSupport} className="stack">
          <label className="field">
            <span>Mobile</span>
            <input name="mobile" inputMode="numeric" required defaultValue={mobile} placeholder="10-digit mobile" />
          </label>
          <div className="pay-detail-grid two">
            <label className="field">
              <span>Priority</span>
              <select name="priority" defaultValue="medium" required>
                {SUPPORT_PRIORITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>About</span>
              <select name="topic" defaultValue="billing" required>
                {SUPPORT_TOPICS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
          <h2>Ticket status</h2>
          <p className="fine">
            {tickets.length === 0 ? "No messages yet." : `${tickets.length} raised.`}
            {highOpen > 0 ? ` ${highOpen} high priority still open.` : ""}
          </p>
          <ul className="status-board">
            <StatusRow count={open} total={tickets.length} kind="created" title="Created" />
            <StatusRow count={progress} total={tickets.length} kind="progress" title="In progress" />
            <StatusRow count={resolved} total={tickets.length} kind="closed" title="Closed / Resolved" />
          </ul>
          {tickets[0] ? (
            <div className="status-latest">
              <span>Latest</span>
              <strong>
                {supportCode(tickets[0].id)} · {STATUS[tickets[0].status] ?? tickets[0].status}
              </strong>
              <p>{tickets[0].message}</p>
            </div>
          ) : null}
        </article>
      </section>
      <article className="card" style={{ marginTop: 14 }}>
        <h2>Your messages</h2>
        {tickets.length === 0 ? (
          <p>None yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="support-table">
              <thead>
                <tr>
                  <th>Support id</th>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>About</th>
                  <th>Status</th>
                  <th>From</th>
                  <th>Mobile</th>
                  <th>Created</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td id={`sup-${ticket.id}`}>{supportCode(ticket.id)}</td>
                    <td className="desc">
                      {ticket.message}
                      {(notesByTicket.get(ticket.id) ?? []).map((note) => (
                        <div className="follow" key={note.id}>
                          <b>
                            {note.sender_name} · {formatStamp(note.created_at)}
                          </b>
                          <div>{note.message}</div>
                        </div>
                      ))}
                      {ticket.reply ? <div className="reply">Zignal: {ticket.reply}</div> : null}
                      <SupportFollowup requestId={ticket.id} />
                    </td>
                    <td>
                      <span className={priorityClass(ticket.priority)}>{labelOf(SUPPORT_PRIORITIES, ticket.priority)}</span>
                    </td>
                    <td>{labelOf(SUPPORT_TOPICS, ticket.topic)}</td>
                    <td>
                      <span className={statusClass(ticket.status)}>{STATUS[ticket.status] ?? ticket.status}</span>
                    </td>
                    <td>{ticket.sender_name}</td>
                    <td>{ticket.mobile}</td>
                    <td>{formatStamp(ticket.created_at)}</td>
                    <td>{ticket.resolved_at ? formatStamp(ticket.resolved_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </>
  );
}

function statusClass(status: string) {
  if (status === "resolved") return "pill";
  if (status === "in_progress") return "pill soon";
  return "pill warn";
}

function priorityClass(priority: string) {
  if (priority === "high") return "pill bad";
  if (priority === "low") return "pill";
  if (priority === "medium") return "pill soon";
  return "fine";
}

function labelOf(list: readonly { value: string; label: string }[], value: string) {
  return list.find((item) => item.value === value)?.label ?? "—";
}

function StatusRow({ count, total, kind, title }: { count: number; total: number; kind: string; title: string }) {
  const share = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <li>
      <div>
        <span>{title}</span>
        <b>{count}</b>
      </div>
      <div className="status-meter" aria-hidden="true">
        <i className={kind} style={{ width: `${share}%` }} />
      </div>
    </li>
  );
}
