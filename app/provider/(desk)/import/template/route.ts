import { requireRole } from "@/lib/auth";
import { CSV_TEMPLATE } from "@/lib/csv";

export async function GET() {
  await requireRole("admin");
  return new Response(CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=zignal-customers.csv",
    },
  });
}
