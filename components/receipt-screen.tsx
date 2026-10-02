import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { ReceiptSheet, type ReceiptDoc } from "@/components/receipt-sheet";
import { Banner } from "@/components/ui";

export function ReceiptScreen({
  back,
  downloadHref,
  notice,
  doc,
}: {
  back: string;
  downloadHref: string;
  notice?: string;
  doc: ReceiptDoc;
}) {
  return (
    <main className="receipt-screen">
      <div className="no-print receipt-actions">
        <Link className="back" href={back}>
          Back
        </Link>
        <div>
          <PrintButton />
          <a className="btn small" href={downloadHref}>
            Download
          </a>
        </div>
      </div>
      <Banner notice={notice} />
      <ReceiptSheet doc={doc} />
    </main>
  );
}
