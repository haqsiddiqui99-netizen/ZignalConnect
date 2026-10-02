import { recordDeskPayment } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";
import { formatInr, formatStamp } from "@/lib/format";
import type { DeskCharge } from "@/lib/receipts";

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function DeskFeeTable({
  charges,
  canRecord,
  empty,
  receiptBase,
}: {
  charges: DeskCharge[];
  canRecord: boolean;
  empty: string;
  receiptBase: string;
}) {
  if (charges.length === 0) return <p>{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Provider</th>
            <th>Plan</th>
            <th className="num">Amount</th>
            <th>Status</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((charge) => (
            <tr key={charge.id}>
              <td>{periodLabel(charge.period)}</td>
              <td>{charge.provider_name}</td>
              <td>{charge.plan_label}</td>
              <td className="num">{formatInr(charge.total)}</td>
              <td>
                {charge.paid_at ? (
                  <>
                    Paid {formatStamp(charge.paid_at)}
                    <div className="fine">
                      {charge.method}
                      {charge.reference ? ` · ${charge.reference}` : ""}
                    </div>
                  </>
                ) : canRecord ? (
                  <form action={recordDeskPayment} className="filters">
                    <input type="hidden" name="desk_payment_id" value={charge.id} />
                    <label className="field">
                      <span>Method</span>
                      <select name="method" defaultValue="UPI">
                        <option>UPI</option>
                        <option>Bank transfer</option>
                        <option>Cash</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Reference</span>
                      <input name="reference" placeholder="UPI or bank reference" />
                    </label>
                    <SubmitButton className="btn small" pendingLabel="Saving…">
                      Record payment
                    </SubmitButton>
                  </form>
                ) : (
                  "Not collected"
                )}
              </td>
              <td>
                <a href={`${receiptBase}/${charge.id}`}>{charge.paid_at ? "Receipt" : "Invoice"}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
