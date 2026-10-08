import { logout } from "@/lib/actions";
import { clearSession, requireRole } from "@/lib/auth";
import { settleDesk } from "@/lib/desk-close";
import { redirect } from "next/navigation";
import { PortalNav } from "@/components/portal-nav";
import { SubscriberChat } from "@/components/subscriber-chat";
import { SubmitButton } from "@/components/submit-button";
import { billCycleLabel } from "@/lib/bill-cycle";
import { invoiceFor } from "@/lib/charges";
import { portalBrand } from "@/lib/entitlements";
import { connectionId, dueLabel, formatDate, formatInr, formatSpeed } from "@/lib/format";
import { lineStatusLabel } from "@/lib/line-status";
import { getSubscriberByUserId, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans } from "@/lib/queries";

function namedLine(count: number, singular: string, plural: string, names: string, empty: string) {
  if (count === 0) return empty;
  const noun = count === 1 ? singular : plural;
  return `This line has ${count} ${noun}${names ? `: ${names}` : ""}.`;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("customer");
  const quit = settleDesk(session.providerId);
  if (quit.phase === "closed") {
    await clearSession();
    redirect(`/?error=${encodeURIComponent(`This desk closed on ${formatDate(quit.closedAt)}. Sign-in has stopped.`)}`);
  }
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
          ispName={session.brandName}
          replies={[
            {
              question: "What plan am I on?",
              text: `Your line is on ${person.plan_name}.`,
              facts: [
                { label: "Plan", value: person.plan_name },
                { label: "Speed", value: formatSpeed(person.speed_mbps) },
                { label: "Data", value: person.data_cap },
                { label: "Connection", value: connectionId(person.id) },
              ],
              href: "/subscriber",
              label: "My connection",
            },
            {
              question: "When is my renewal?",
              text: `Your next renewal is ${formatDate(person.renew_date)}.`,
              facts: [
                { label: "Renewal", value: formatDate(person.renew_date) },
                { label: "Timing", value: dueLabel(person.renew_date) },
                { label: "Billing", value: billCycleLabel(person.bill_cycle) },
              ],
              href: "/subscriber/pay",
              label: "Pay bill",
            },
            {
              question: "How much do I owe?",
              text: dueAmount > 0 ? `You currently owe ${formatInr(dueAmount)}.` : "Nothing is due on this line right now.",
              facts: [{ label: "Amount due", value: formatInr(dueAmount) }],
              href: "/subscriber/pay",
              label: "Pay bill",
            },
            {
              question: "What is my connection status?",
              text: `Your connection is ${lineStatusLabel(person.status).toLowerCase()}.`,
              facts: [{ label: "Status", value: lineStatusLabel(person.status) }],
              href: "/subscriber",
              label: "My connection",
            },
            {
              question: "What charges are on my line?",
              text: namedLine(charges.length, "charge", "charges", "", "No extra charges are on this line."),
              facts: charges.length > 0 ? [{ label: "Charges", value: chargeNames || String(charges.length) }] : undefined,
              href: "/subscriber",
              label: "My connection",
            },
            {
              question: "What discounts are on my line?",
              text: namedLine(discounts.length, "discount", "discounts", "", "No discounts are on this line."),
              facts: discounts.length > 0 ? [{ label: "Discounts", value: discountNames || String(discounts.length) }] : undefined,
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
