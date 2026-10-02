import Link from "next/link";
import { SubscriberForm } from "@/components/subscriber-form";
import { Banner } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { DEMO_CUSTOMER_PASSWORD } from "@/lib/demo";
import { allows } from "@/lib/entitlements";
import { listPlans } from "@/lib/queries";

export const metadata = { title: "Add subscriber" };

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole("admin");
  const { error } = await searchParams;
  const plans = listPlans(session.providerId);
  return (
    <>
      <p>
        <Link className="back" href="/provider/subscriber">
          All subscribers
        </Link>
      </p>
      <header className="page-head">
        <div>
          <h1>Add a subscriber</h1>
          <p>This creates the service record and a portal login. The starting password is {DEMO_CUSTOMER_PASSWORD}.</p>
        </div>
      </header>
      <Banner error={error} />
      <article className="card">
        <SubscriberForm plans={plans} showArea={allows(session.productPlan, "areas")} />
      </article>
    </>
  );
}
