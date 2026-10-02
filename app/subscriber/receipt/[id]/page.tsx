import { notFound, redirect } from "next/navigation";
import { ReceiptScreen } from "@/components/receipt-screen";
import { requireRole } from "@/lib/auth";
import { incomeDocument } from "@/lib/receipts";

export const metadata = { title: "Receipt" };

export default async function SubscriberReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (query.notice) redirect(`/subscriber/receipt/${id}`);
  const session = await requireRole("customer");
  const doc = incomeDocument(Number(id), session);
  if (!doc) notFound();
  return (
    <ReceiptScreen
      back="/subscriber/receipts"
      downloadHref={`/subscriber/receipt/${id}/file`}
      notice={query.notice}
      doc={doc}
    />
  );
}
