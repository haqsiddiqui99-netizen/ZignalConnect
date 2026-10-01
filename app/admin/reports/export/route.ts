import { requireRole } from "@/lib/auth";
import { allows } from "@/lib/entitlements";
import { listPayments } from "@/lib/queries";

function cell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export async function GET() {
  const session = await requireRole("admin");
  if (!session.isOwner) {
    return new Response("The collection report is for the owner.", { status: 403 });
  }
  if (!allows(session.productPlan, "reports")) {
    return new Response("Collection export is part of Pro, Ultra, and Premium.", { status: 403 });
  }
  const payments = listPayments({ providerId: session.providerId });
  const lines = [
    ["paid_at", "subscriber", "method", "reference", "amount", "kind", "period_end", "note"].join(","),
    ...payments.map((payment) =>
      [
        payment.paid_at,
        payment.customer_name,
        payment.method,
        payment.reference,
        payment.amount,
        payment.kind,
        payment.period_end,
        payment.note,
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=zignal-payments.csv",
    },
  });
}
