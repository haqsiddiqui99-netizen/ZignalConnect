import { requireRole } from "@/lib/auth";
import { ComplaintTable } from "@/components/complaint-table";
import { FilterForm, FilterLink } from "@/components/filter-form";
import { Banner } from "@/components/ui";
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, complaintCode, isComplaintStatus, slaLabel, type ComplaintStatus } from "@/lib/complaints";
import { listComplaints, listStaff } from "@/lib/queries";

export const metadata = { title: "Complaint" };

export default async function AdminComplaints({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; id?: string; subscriber?: string; status?: string; assignee?: string; category?: string }>;
}) {
  const session = await requireRole("admin");
  const query = await searchParams;
  const tickets = listComplaints({ providerId: session.providerId }).map((ticket) => ({
    id: ticket.id,
    customer_id: ticket.customer_id,
    customer_name: ticket.customer_name,
    category: ticket.category,
    details: ticket.details,
    status: ticket.status,
    provider_note: ticket.provider_note,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    assignee_id: ticket.assignee_id,
    assignee_name: ticket.assignee_name,
    resolved_at: ticket.resolved_at,
    sla_hours: ticket.sla_hours,
  }));
  const staff = listStaff(session.providerId).map((person) => ({ id: person.id, name: person.name }));
  const open = tickets.filter((ticket) => ticket.status !== "resolved");
  const breached = open.filter((ticket) => slaLabel(ticket.created_at, ticket.resolved_at, ticket.sla_hours).breached).length;
  const statusCounts = Object.fromEntries(COMPLAINT_STATUSES.map((item) => [item.value, 0])) as Record<ComplaintStatus, number>;
  const byAssignee = new Map<string, Record<ComplaintStatus, number>>();
  for (const ticket of tickets) {
    if (!isComplaintStatus(ticket.status)) continue;
    statusCounts[ticket.status] += 1;
    const assignee = ticket.assignee_name || "Unassigned";
    const row = byAssignee.get(assignee) ?? { new: 0, assigned: 0, pending: 0, resolved: 0 };
    row[ticket.status] += 1;
    byAssignee.set(assignee, row);
  }
  const assigneeRows = [...byAssignee.entries()].sort((a, b) => {
    if (a[0] === "Unassigned") return -1;
    if (b[0] === "Unassigned") return 1;
    return a[0].localeCompare(b[0]);
  });
  const idQuery = (query.id ?? "").trim().toLowerCase();
  const subscriberQuery = (query.subscriber ?? "").trim().toLowerCase();
  const statusQuery = isComplaintStatus(query.status ?? "") ? query.status : "";
  const assigneeQuery = query.assignee ?? "";
  const categoryQuery = query.category && COMPLAINT_CATEGORIES[query.category] ? query.category : "";
  const shown = tickets.filter((ticket) => {
    if (idQuery) {
      const code = complaintCode(ticket.id).toLowerCase();
      const digits = idQuery.replace(/\D/g, "");
      const hit = code.includes(idQuery) || (digits !== "" && (String(ticket.id) === digits || String(1000 + ticket.id) === digits));
      if (!hit) return false;
    }
    if (subscriberQuery && !ticket.customer_name.toLowerCase().includes(subscriberQuery)) return false;
    if (statusQuery && ticket.status !== statusQuery) return false;
    if (assigneeQuery === "none" && ticket.assignee_id) return false;
    if (assigneeQuery && assigneeQuery !== "none" && String(ticket.assignee_id ?? "") !== assigneeQuery) return false;
    if (categoryQuery && ticket.category !== categoryQuery) return false;
    return true;
  });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Complaint</h1>
          <p>
            {tickets.length} on this desk · {open.length} still open
            {breached > 0 ? ` · ${breached} past SLA` : ""}.
          </p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      {tickets.length === 0 ? null : (
        <>
          <section className="stats" aria-label="Complaint summary">
            {COMPLAINT_STATUSES.map((item) => (
              <article key={item.value} className="stat">
                <span>{item.label}</span>
                <b>{statusCounts[item.value]}</b>
              </article>
            ))}
          </section>
          <article className="card" style={{ marginBottom: 18 }}>
            <h2>By assignee</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Assignee</th>
                    {COMPLAINT_STATUSES.map((item) => (
                      <th key={item.value} className="num">
                        {item.label}
                      </th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {assigneeRows.map(([name, row]) => {
                    const total = row.new + row.assigned + row.pending + row.resolved;
                    return (
                      <tr key={name}>
                        <td>{name}</td>
                        {COMPLAINT_STATUSES.map((item) => (
                          <td key={item.value} className="num">
                            {row[item.value]}
                          </td>
                        ))}
                        <td className="num">{total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
      {tickets.length === 0 ? (
        <article className="card">
          <p>No complaints yet. Subscribers file them from their portal.</p>
        </article>
      ) : (
        <article className="card">
          <FilterForm
            className="filters one-line"
            key={[query.id, query.subscriber, query.status, query.assignee, query.category].join("|")}
          >
            <input name="id" placeholder="Complaint id" defaultValue={query.id ?? ""} aria-label="Complaint id" />
            <input name="subscriber" placeholder="Subscriber" defaultValue={query.subscriber ?? ""} aria-label="Subscriber" />
            <select name="status" defaultValue={isComplaintStatus(query.status ?? "") ? query.status : ""} aria-label="Status">
              <option value="">Any status</option>
              {COMPLAINT_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select name="assignee" defaultValue={query.assignee ?? ""} aria-label="Assignee">
              <option value="">Any assignee</option>
              <option value="none">Unassigned</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <select name="category" defaultValue={query.category && COMPLAINT_CATEGORIES[query.category] ? query.category : ""} aria-label="Complaint">
              <option value="">Any complaint</option>
              {Object.entries(COMPLAINT_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button className="btn small" type="submit">
              Filter
            </button>
            <FilterLink className="btn small" href="/provider/complaints">
              Reset
            </FilterLink>
          </FilterForm>
          {shown.length === 0 ? (
            <p>No complaints match that filter.</p>
          ) : (
            <ComplaintTable tickets={shown} staff={staff} />
          )}
        </article>
      )}
    </>
  );
}
