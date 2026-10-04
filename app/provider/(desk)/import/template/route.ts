import { requireRole } from "@/lib/auth";
import { customerWorkbook } from "@/lib/customer-book";
import { listChargeCatalogue, listDiscountCatalogue, listPlans } from "@/lib/queries";

export async function GET() {
  const session = await requireRole("admin");
  const body = await customerWorkbook({
    plans: listPlans(session.providerId).map((plan) => plan.name),
    charges: listChargeCatalogue(session.providerId).map((charge) => charge.name),
    discounts: listDiscountCatalogue(session.providerId).map((discount) => discount.name),
  });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=zignal-customers.xlsx",
    },
  });
}
