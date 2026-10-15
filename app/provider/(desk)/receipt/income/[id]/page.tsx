import { notFound, redirect } from "next/navigation";
import { ReceiptScreen } from "@/components/receipt-screen";
import { requireRole } from "@/lib/auth";
import { incomeDocument } from "@/lib/receipts";

export const metadata = { title: "Receipt" };

export default async function ProviderIncomeReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (query.notice) redirect(`/provider/receipt/income/${id}`);
  const session = await requireRole("admin");
  const doc = incomeDocument(Number(id), session);
  if (!doc) notFound();
  return (
    <ReceiptScreen
      back="/provider/revenue"
      downloadHref={`/provider/receipt/income/${id}/file`}
      notice={query.notice}
      doc={doc}
    />
  );
}
