import { renderToStaticMarkup } from "react-dom/server";
import { ReceiptSheet, type ReceiptDoc } from "@/components/receipt-sheet";

export function receiptFile(doc: ReceiptDoc) {
  const body = renderToStaticMarkup(<ReceiptSheet doc={doc} />);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${doc.number}</title></head><body style="margin:24px;background:#f3efe7;font-family:Segoe UI,sans-serif">${body}</body></html>`;
}
