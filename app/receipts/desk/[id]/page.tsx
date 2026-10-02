import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function LegacyDeskReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/");
  if (session.kind === "desk" && session.role !== "admin") redirect("/");
  const base = session.kind === "operator" ? `/zignal/receipt/${id}` : `/provider/receipt/desk/${id}`;
  redirect(base);
}
