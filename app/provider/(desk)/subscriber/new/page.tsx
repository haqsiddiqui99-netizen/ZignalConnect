import Link from "next/link";
import { SubscriberForm } from "@/components/subscriber-form";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DEMO_CUSTOMER_PASSWORD } from "@/lib/demo";
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
      <p>
        <Link className="btn small" href="/provider/subscriber">
          ← All subscribers
        </Link>
      </p>
      <header className="page-head">
        <div>
          <h1>Add a subscriber</h1>
          <p>This creates the service record and a portal login. The starting password is {DEMO_CUSTOMER_PASSWORD}.</p>
        </div>
        <Link className="btn" href="/provider/import">
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
