import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { ReceiptSheet } from "@/components/receipt-sheet";
import { Banner } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { deskDocument } from "@/lib/receipts";

export const metadata = { title: "Desk receipt" };

export default async function DeskReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await getSession();
  if (!session) redirect("/");
  if (session.kind === "desk" && session.role !== "admin") redirect("/");
  const doc = deskDocument(
    Number(id),
    session.kind === "operator"
      ? { kind: "operator" }
      : { kind: "desk", role: "admin", providerId: session.providerId },
  );
  if (!doc) notFound();
  const back = session.kind === "operator" ? "/operator/revenue" : "/admin/payments";

  return (
    <main className="receipt-screen">
      <div className="no-print receipt-actions">
        <Link className="back" href={back}>
          Back
        </Link>
        <div>
          <PrintButton />
          <a className="btn small" href={`/receipts/desk/${id}/file`}>
            Download
          </a>
        </div>
      </div>
      <Banner notice={query.notice} />
      <ReceiptSheet doc={doc} />
    </main>
  );
}
