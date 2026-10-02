import Link from "next/link";
import { PremiumQuote } from "@/components/premium-upgrade";
import { requireRole } from "@/lib/auth";
import { limitLabel } from "@/lib/entitlements";
import { getUsage } from "@/lib/queries";
import { redirect } from "next/navigation";

export const metadata = { title: "Premium" };

export default async function PremiumQuotePage() {
  const session = await requireRole("admin");
  if (!session.isOwner) redirect("/provider/upgrade");
  const usage = getUsage(session.providerId);
  const suggested = Math.max(usage.subscriberBase, usage.customers, 1);

  return (
    <>
      <p>
        <Link className="back" href="/provider/upgrade">
          Desk plan
        </Link>
      </p>
      <header className="page-head">
        <div>
          <h1>Premium</h1>
          <p>The monthly rate is set from the subscriber base.</p>
        </div>
      </header>
      <article className="card quote-card">
        <PremiumQuote
          customers={usage.customers}
          staff={usage.staff}
          placeholder={limitLabel(suggested)}
        />
      </article>
    </>
  );
}
