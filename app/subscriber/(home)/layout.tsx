import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PortalNav } from "@/components/portal-nav";
import { SubscriberChat } from "@/components/subscriber-chat";
import { SubmitButton } from "@/components/submit-button";
import { billCycleLabel } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import { portalBrand } from "@/lib/entitlements";
import { connectionId, dueLabel, formatDate, formatInr, formatSpeed } from "@/lib/format";
import { lineStatusLabel } from "@/lib/line-status";
import { getSubscriberByUserId, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";
import { issueRenewalReminders } from "@/lib/renewals";

function namedLine(count: number, singular: string, plural: string, names: string, empty: string) {
  if (count === 0) return empty;
  const noun = count === 1 ? singular : plural;
  return `This line has ${count} ${noun}${names ? `: ${names}` : ""}.`;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("customer");
  issueRenewalReminders(session.providerId);
  const brand = portalBrand(session.productPlan, session.brandName, session.logoLetter);
  const person = getSubscriberByUserId(session.uid);
  const charges = person ? listCustomerCharges(person.id) : [];
  const discounts = person ? listCustomerDiscounts(person.id) : [];
  const dueAmount = person
    ? invoiceFor(person, charges, {
        discounts,
        extraPlans: listCustomerExtraPlans(person.id),
      }).due
    : 0;
  const chargeNames = charges.map((charge) => charge.label).filter(Boolean).join(", ");
  const discountNames = discounts.map((discount) => discount.name).filter(Boolean).join(", ");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">{brand.mark}</div>
          <div>
            <strong>{brand.title}</strong>
            <span>My connection</span>
          </div>
        </div>
        <PortalNav />
        <form action={logout} className="side-foot">
          <div>
            <strong>{session.name}</strong>
            <div className="fine">Subscriber</div>
          </div>
          <SubmitButton className="btn small" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </aside>
      <div className="app-main">{children}</div>
      {person ? (
        <SubscriberChat
          replies={[
            {
              question: "What plan am I on?",
              text: `You are on ${person.plan_name}, ${formatSpeed(person.speed_mbps)}, ${person.data_cap}. Your connection is ${connectionId(person.id)}.`,
              href: "/subscriber",
              label: "My connection",
            },
            {
              question: "When is my renewal?",
              text: `Next renewal is ${formatDate(person.renew_date)} (${dueLabel(person.renew_date).toLowerCase()}). Billing is ${billCycleLabel(person.bill_cycle).toLowerCase()}.`,
              href: "/subscriber/pay",
              label: "Pay bill",
            },
            {
              question: "How much do I owe?",
              text: `Amount due is ${formatInr(dueAmount)}.`,
              href: "/subscriber/pay",
              label: "Pay bill",
            },
            {
              question: "What is my connection status?",
              text: `This line is ${lineStatusLabel(person.status).toLowerCase()}.`,
              href: "/subscriber",
              label: "My connection",
            },
            {
              question: "What charges are on my line?",
              text: namedLine(charges.length, "charge", "charges", chargeNames, "No extra charges are on this line."),
              href: "/subscriber",
              label: "My connection",
            },
            {
              question: "What discounts are on my line?",
              text: namedLine(discounts.length, "discount", "discounts", discountNames, "No discounts are on this line."),
              href: "/subscriber",
              label: "My connection",
            },
          ]}
          tickets={[
            { question: "Internet is slow", kind: "slow" },
            { question: "Internet is not working", kind: "not_working" },
            { question: "Internet is down", kind: "down" },
          ]}
        />
      ) : null}
    </div>
  );
}
