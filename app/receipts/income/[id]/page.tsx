import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { ReceiptSheet } from "@/components/receipt-sheet";
import { Banner } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { incomeDocument } from "@/lib/receipts";

export const metadata = { title: "Receipt" };

export default async function IncomeReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await getSession();
  if (!session || session.kind !== "desk") redirect("/");
  const doc = incomeDocument(Number(id), session);
  if (!doc) notFound();
  const back = session.role === "admin" ? "/admin/payments" : "/portal/history";

  return (
    <main className="receipt-screen">
      <div className="no-print receipt-actions">
        <Link className="back" href={back}>
          Back
        </Link>
        <div>
          <PrintButton />
          <a className="btn small" href={`/receipts/income/${id}/file`}>
            Download
          </a>
        </div>
      </div>
      <Banner notice={query.notice} />
      <ReceiptSheet doc={doc} />
    </main>
  );
}
