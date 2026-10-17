import Link from "next/link";
import { markAgentCommissionPaid } from "@/lib/actions";
import { requireOperator } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { formatInr, formatStamp } from "@/lib/format";
import { listAgentCommissions } from "@/lib/queries";

export const metadata = { title: "Agents" };

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireOperator();
  const query = await searchParams;
  const rows = listAgentCommissions();
  const owed = rows.filter((row) => !row.paid_at).reduce((sum, row) => sum + row.commission, 0);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Agents</h1>
          <p>Commission is written when a desk fee is recorded. It comes from the rate card and does not include GST.</p>
        </div>
      </header>
      <Banner error={query.error} notice={query.notice} />
      <section className="stats" aria-label="Commission">
        <article className="stat">
          <span>Waiting to pay</span>
          <b>{formatInr(owed)}</b>
        </article>
        <article className="stat">
          <span>Open rows</span>
          <b>{rows.filter((row) => !row.paid_at).length}</b>
        </article>
      </section>
      <article className="card">
        {rows.length === 0 ? (
          <p>No commission has been written. Save an agent on a desk, then record a paid desk fee.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Desk</th>
                  <th>Term</th>
                  <th className="num">Plan fee</th>
                  <th className="num">Commission</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.agent_name}</td>
                    <td>
                      <Link href={`/zignal/provider/${row.provider_id}?tab=account`}>{row.provider_name}</Link>
                    </td>
                    <td>{row.billing_term}</td>
                    <td className="num">{formatInr(row.plan_fee)}</td>
                    <td className="num">{formatInr(row.commission)}</td>
                    <td>
                      {row.paid_at ? (
                        `Paid ${formatStamp(row.paid_at)}`
                      ) : (
                        <form action={markAgentCommissionPaid}>
                          <input type="hidden" name="commission_id" value={row.id} />
                          <input type="hidden" name="return_to" value="/zignal/agents" />
                          <SubmitButton className="btn small" pendingLabel="Saving…">
                            Mark paid
                          </SubmitButton>
                        </form>
                      )}
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
