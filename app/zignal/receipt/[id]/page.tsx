import { notFound, redirect } from "next/navigation";
import { ReceiptScreen } from "@/components/receipt-screen";
import { requireOperator } from "@/lib/auth";
import { deskDocument } from "@/lib/receipts";

export const metadata = { title: "Desk receipt" };

export default async function ZignalReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (query.notice) redirect(`/zignal/receipt/${id}`);
  await requireOperator();
  const doc = deskDocument(Number(id), { kind: "operator" });
  if (!doc) notFound();
  return (
    <ReceiptScreen
      back="/zignal/revenue"
      downloadHref={`/zignal/receipt/${id}/file`}
      notice={query.notice}
      doc={doc}
    />
  );
}
