import { receiptFile } from "@/lib/receipt-file";
import { getSession } from "@/lib/auth";
import { deskDocument } from "@/lib/receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || (session.kind === "desk" && session.role !== "admin")) return new Response("Not found", { status: 404 });
  const doc = deskDocument(
    Number(id),
    session.kind === "operator"
      ? { kind: "operator" }
      : { kind: "desk", role: "admin", providerId: session.providerId },
  );
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(receiptFile(doc), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="receipt-${doc.number}.html"`,
    },
  });
}
