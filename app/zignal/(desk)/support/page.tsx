import { requireOperator } from "@/lib/auth";
import { ZignalTickets } from "@/components/zignal-tickets";
import { Banner } from "@/components/ui";
import { listSupport, listSupportFollowups } from "@/lib/queries";
import { supportIsFinished } from "@/lib/support";

export const metadata = { title: "My Support" };

export default async function OperatorSupport({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; ticket?: string }>;
}) {
  await requireOperator();
  const query = await searchParams;
  const tickets = listSupport({ all: true }).map((ticket) => ({ ...ticket }));
  const notes = listSupportFollowups(tickets.map((ticket) => ticket.id)).map((note) => ({ ...note }));
  const open = tickets.filter((ticket) => !supportIsFinished(ticket.status)).length;
  const requested = Number(query.ticket);
  const openId = tickets.some((ticket) => ticket.id === requested) ? requested : null;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>My Support</h1>
          <p>
            {tickets.length} messages from providers · {open} still open. Open a ticket to reply or change its status. The window closes after you save.
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      {tickets.length === 0 ? (
        <article className="card">
          <p>No messages yet. Provider owners and staff send them from Zignal support on their desk.</p>
        </article>
      ) : (
        <article className="card">
          <ZignalTickets
            key={tickets.map((ticket) => `${ticket.id}:${ticket.updated_at}:${ticket.status}:${ticket.reply}`).join("|")}
            tickets={tickets}
            notes={notes}
            openId={openId}
          />
        </article>
      )}
    </>
  );
}
