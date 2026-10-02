import { receiptFile } from "@/lib/receipt-file";
import { getSession } from "@/lib/auth";
import { incomeDocument } from "@/lib/receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.kind !== "desk") return new Response("Not found", { status: 404 });
  const doc = incomeDocument(Number(id), session);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(receiptFile(doc), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="receipt-${doc.number}.html"`,
    },
  });
}
