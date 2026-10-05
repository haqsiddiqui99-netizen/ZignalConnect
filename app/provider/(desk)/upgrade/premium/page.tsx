import Link from "next/link";
import { PremiumQuote } from "@/components/premium-upgrade";
import { requireRole } from "@/lib/auth";
import { isBillTerm, limitLabel } from "@/lib/entitlements";
import { getUsage } from "@/lib/queries";
import { redirect } from "next/navigation";

export const metadata = { title: "Premium" };

export default async function PremiumQuotePage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const session = await requireRole("admin");
  if (!session.isOwner) redirect("/provider/upgrade");
  const query = await searchParams;
  const usage = getUsage(session.providerId);
  const suggested = Math.max(usage.subscriberBase, usage.customers, 1);
  const term = query.term && isBillTerm(query.term) ? query.term : "monthly";

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
          <p>The rate is set from the subscriber base. Quarterly is 10% off. Yearly drops two months.</p>
        </div>
      </header>
      <article className="card quote-card">
        <PremiumQuote
          customers={usage.customers}
          staff={usage.staff}
          placeholder={limitLabel(suggested)}
          term={term}
        />
      </article>
    </>
  );
}
