import { requireRole } from "@/lib/auth";
import { receiptAttachment } from "@/lib/receipt-download";
import { incomeDocument } from "@/lib/receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("customer");
  const doc = incomeDocument(Number(id), session);
  if (!doc) return new Response("Not found", { status: 404 });
  return receiptAttachment(doc);
}
