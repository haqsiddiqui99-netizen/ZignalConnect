import Link from "next/link";
import { SubscriberForm } from "@/components/subscriber-form";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { allows } from "@/lib/entitlements";
import { listChargeCatalogue, listDiscountCatalogue, listPlans } from "@/lib/queries";

export const metadata = { title: "Add subscriber" };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole("admin");
  const { error } = await searchParams;
  const plans = listPlans(session.providerId);
  const charges = listChargeCatalogue(session.providerId).map((charge) => ({
    id: charge.id,
    name: charge.name,
    kind: charge.kind,
    amount: charge.amount,
    taxIncluded: charge.tax_included !== 0,
    taxPercent: charge.tax_percent,
  }));
  const offers = listDiscountCatalogue(session.providerId).map((offer) => ({
    id: offer.id,
    name: offer.name,
    applies: offer.applies_to,
    frequency: offer.frequency === "once" ? ("once" as const) : ("recurring" as const),
    mode: offer.mode === "amount" ? ("amount" as const) : ("percent" as const),
    value: offer.value,
  }));
  return (
    <>
      <header className="page-head with-action">
        <div className="head-line">
          <Link className="btn" href="/provider/subscriber">
            ← All subscribers
          </Link>
          <h1>Add a subscriber</h1>
        </div>
        <Link className="btn import-link" href="/provider/import">
          Import Subscribers
        </Link>
      </header>
      <Banner error={error} />
      <article className="card">
        <SubscriberForm plans={plans} charges={charges} offers={offers} showArea={allows(session.productPlan, "areas")} />
      </article>
    </>
  );
}
