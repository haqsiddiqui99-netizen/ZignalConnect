import type { ReceiptDoc } from "@/components/receipt-sheet";
import { receiptFile } from "@/lib/receipt-file";

export function receiptAttachment(doc: ReceiptDoc) {
  return new Response(receiptFile(doc), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="receipt-${doc.number}.html"`,
    },
  });
}
