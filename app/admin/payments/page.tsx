import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatInr, formatStamp } from "@/lib/format";
import { listPayments } from "@/lib/queries";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const session = await requireRole("admin");
  const payments = listPayments({ providerId: session.providerId });
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            {payments.length} receipts
            {session.isOwner ? ` · ${formatInr(total)} on the ledger.` : "."}
          </p>
        </div>
      </header>
      <article className="card">
        {payments.length === 0 ? (
          <p>No payments yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Subscriber</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th>Kind</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatStamp(payment.paid_at)}</td>
                    <td>
                      <Link className="rowlink" href={`/admin/customers/${payment.customer_id}`}>
                        {payment.customer_name}
                      </Link>
                    </td>
                    <td>{payment.method}</td>
                    <td>{payment.reference}</td>
                    <td className="num">{formatInr(payment.amount)}</td>
                    <td>{payment.kind === "partial" ? "Partial" : "Full cycle"}</td>
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
