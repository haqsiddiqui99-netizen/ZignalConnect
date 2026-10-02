import { notFound, redirect } from "next/navigation";
import { ReceiptScreen } from "@/components/receipt-screen";
import { requireRole } from "@/lib/auth";
import { deskDocument } from "@/lib/receipts";

export const metadata = { title: "Desk receipt" };

export default async function ProviderDeskReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (query.notice) redirect(`/provider/receipt/desk/${id}`);
  const session = await requireRole("admin");
  const doc = deskDocument(Number(id), { kind: "desk", role: "admin", providerId: session.providerId });
  if (!doc) notFound();
  return (
    <ReceiptScreen
      back="/provider/revenue"
      downloadHref={`/provider/receipt/desk/${id}/file`}
      notice={query.notice}
      doc={doc}
    />
  );
}
