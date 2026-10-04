import { requireRole } from "@/lib/auth";
import { paymentWorkbook } from "@/lib/payment-book";

export async function GET() {
  await requireRole("admin");
  const body = await paymentWorkbook();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=zignal-payments.xlsx",
    },
  });
}
