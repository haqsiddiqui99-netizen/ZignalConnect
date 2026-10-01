import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/format";
import { listSubscribers } from "@/lib/queries";
import { Banner, LineId, StatusPill } from "@/components/ui";

export const metadata = { title: "Subscribers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; billing?: string; error?: string; notice?: string }>;
}) {
  const session = await requireRole("admin");
  const params = await searchParams;
  const people = listSubscribers(session.providerId, { q: params.q, status: params.status, billing: params.billing });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Subscribers</h1>
          <p>{people.length} shown. Open a line to edit details, take a payment, or send a reminder.</p>
        </div>
        <Link className="btn primary" href="/admin/customers/new">
          Add subscriber
        </Link>
      </header>
      <Banner error={params.error} notice={params.notice} />
      <form className="filters" method="get">
        <input name="q" placeholder="Name, mobile, city, email" defaultValue={params.q ?? ""} />
        <select name="billing" defaultValue={params.billing ?? ""}>
          <option value="">All billing</option>
          <option value="due">Due in 7 days</option>
          <option value="overdue">Overdue</option>
        </select>
        <select name="status" defaultValue={params.status ?? ""}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Paused</option>
        </select>
        <button className="btn small" type="submit">
          Filter
        </button>
      </form>
      <article className="card">
        {people.length === 0 ? (
          <p>No subscribers match that filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Contact</th>
                  <th>Plan</th>
                  <th>Renewal</th>
                  <th className="num">Monthly</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <Link className="rowlink" href={`/admin/customers/${person.id}`}>
                        {person.name}
                      </Link>
                      <div>
                        <LineId id={person.id} /> · {person.city}
                      </div>
                    </td>
                    <td>
                      {person.mobile}
                      <div className="fine">{person.email}</div>
                    </td>
                    <td>{person.plan_name}</td>
                    <td>{formatDate(person.renew_date)}</td>
                    <td className="num">{formatInr(person.price)}</td>
                    <td>
                      <StatusPill status={person.status} renewDate={person.renew_date} />
                    </td>
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
