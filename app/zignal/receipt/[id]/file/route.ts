import { requireOperator } from "@/lib/auth";
import { receiptAttachment } from "@/lib/receipt-download";
import { deskDocument } from "@/lib/receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOperator();
  const doc = deskDocument(Number(id), { kind: "operator" });
  if (!doc) return new Response("Not found", { status: 404 });
  return receiptAttachment(doc);
}
