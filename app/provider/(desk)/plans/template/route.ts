import { requireRole } from "@/lib/auth";
import { PLAN_CSV_TEMPLATE } from "@/lib/csv";

export async function GET() {
  await requireRole("admin");
  return new Response(PLAN_CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=zignal-plans.csv",
    },
  });
}
