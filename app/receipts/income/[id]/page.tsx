import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function LegacyIncomeReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.kind !== "desk") redirect("/");
  const base = session.role === "admin" ? `/provider/receipt/income/${id}` : `/subscriber/receipt/${id}`;
  redirect(base);
}
