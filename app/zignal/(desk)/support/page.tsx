import { replySupport } from "@/lib/actions";
import { requireOperator } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import { listSupport, listSupportFollowups, SUPPORT_PRIORITIES, SUPPORT_TOPICS, supportCode } from "@/lib/queries";

export const metadata = { title: "Support" };

export default async function OperatorSupport({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOperator();
  const query = await searchParams;
  const tickets = listSupport({ all: true });
  const notes = listSupportFollowups(tickets.map((ticket) => ticket.id));
  const open = tickets.filter((ticket) => ticket.status !== "resolved").length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Support</h1>
          <p>
            {tickets.length} messages from providers · {open} still open. Call the mobile on the message, or reply here.
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      {tickets.length === 0 ? (
        <article className="card">
          <p>No messages yet. Provider owners and staff send them from Zignal support on their desk.</p>
        </article>
      ) : (
        <div className="stack">
          {tickets.map((ticket) => (
            <article className="card" key={ticket.id}>
              <p className="fine">
                {supportCode(ticket.id)} · {priorityLabel(ticket.priority)} · {topicLabel(ticket.topic)} · {formatStamp(ticket.created_at)}
                {ticket.resolved_at ? ` · Resolved ${formatStamp(ticket.resolved_at)}` : ""} · {ticket.provider_name} · {ticket.sender_name} · {ticket.mobile}
              </p>
              <h2>{ticket.provider_name}</h2>
              <p>{ticket.message}</p>
              {notes
                .filter((note) => note.request_id === ticket.id)
                .map((note) => (
                  <p key={note.id} className="fine" style={{ marginTop: 8 }}>
                    Follow-up · {note.sender_name} · {formatStamp(note.created_at)} — {note.message}
                  </p>
                ))}
              <form action={replySupport} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="request_id" value={ticket.id} />
                <label className="field">
                  <span>Status</span>
                  <select name="status" defaultValue={ticket.status}>
                    <option value="open">Open</option>
                    <option value="in_progress">Being looked at</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label className="field">
                  <span>Reply</span>
                  <textarea name="reply" maxLength={800} rows={2} defaultValue={ticket.reply} />
                </label>
                <SubmitButton className="btn small" pendingLabel="Saving…">
                  Save reply
                </SubmitButton>
              </form>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function priorityLabel(value: string) {
  return SUPPORT_PRIORITIES.find((item) => item.value === value)?.label ?? "No priority";
}

function topicLabel(value: string) {
  return SUPPORT_TOPICS.find((item) => item.value === value)?.label ?? "No topic";
}
