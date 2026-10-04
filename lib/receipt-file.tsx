import { ReceiptSheet, type ReceiptDoc } from "@/components/receipt-sheet";

export async function receiptFile(doc: ReceiptDoc) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(<ReceiptSheet doc={doc} />);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${doc.number}</title></head><body style="margin:24px;background:#f3efe7;font-family:Segoe UI,sans-serif">${body}</body></html>`;
}
