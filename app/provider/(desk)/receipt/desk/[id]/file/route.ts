import { requireRole } from "@/lib/auth";
import { receiptAttachment } from "@/lib/receipt-download";
import { deskDocument } from "@/lib/receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("admin");
  const doc = deskDocument(Number(id), { kind: "desk", role: "admin", providerId: session.providerId });
  if (!doc) return new Response("Not found", { status: 404 });
  return receiptAttachment(doc);
}
