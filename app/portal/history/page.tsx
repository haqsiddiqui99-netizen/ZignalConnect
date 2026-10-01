import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { formatDate, formatInr, formatStamp } from "@/lib/format";
import { getSubscriberByUserId, listPayments } from "@/lib/queries";

export const metadata = { title: "Receipts" };

export default async function HistoryPage() {
  const session = await requireRole("customer");
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const payments = listPayments({ customerId: person.id });

  return (
    <>
      <p>
        <Link className="back" href="/portal">
          My connection
        </Link>
      </p>
      <header className="page-head">
        <div>
          <h1>Receipts</h1>
          <p>Every payment recorded against {person.plan_name}.</p>
        </div>
      </header>
      <article className="card">
        {payments.length === 0 ? (
          <p>No receipts yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Reference</th>
                  <th>Method</th>
                  <th>Covers until</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatStamp(payment.paid_at)}</td>
                    <td>
                      {payment.reference}
                      {payment.note ? <div className="fine">{payment.note}</div> : null}
                    </td>
                    <td>{payment.method}</td>
                    <td>{formatDate(payment.period_end)}</td>
                    <td className="num">{formatInr(payment.amount)}</td>
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
