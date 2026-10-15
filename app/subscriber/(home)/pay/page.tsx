import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { applySubscriberPromo, payBill, sendUpiPayment } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { AddPromo } from "@/components/add-promo";
import { PayMethods } from "@/components/pay-methods";
import { SubmitButton } from "@/components/submit-button";
import { Banner } from "@/components/ui";
import { promoOff } from "@/lib/checkout";
import { allows } from "@/lib/entitlements";
import { billCycleAdvance, billCycleLabel, nextRenewalDate } from "@/lib/bill-cycle";
import { billTaxNote, chargeSummary, discountSummary, invoiceFor, openCharges } from "@/lib/charges";
import { connectionId, formatDate, formatInr, formatSpeed, formatStamp, todayISO } from "@/lib/format";
import {
  collectOptions,
  findCataloguePromo,
  getProvider,
  getSubscriberByUserId,
  latestUpiClaim,
  listCustomerCharges,
  listCustomerDiscounts,
  listCustomerExtraPlans,
} from "@/lib/queries";

export const metadata = { title: "Pay bill" };

function upiLink(input: { upi: string; payee: string; amount: number; note: string }) {
  const parts = [
    ["pa", input.upi],
    ["pn", input.payee],
    ["am", input.amount.toFixed(2)],
    ["cu", "INR"],
    ["tn", input.note],
  ];
  return `upi://pay?${parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; promo?: string }>;
}) {
  const session = await requireRole("customer");
  const query = await searchParams;
  const person = getSubscriberByUserId(session.uid);
  if (!person) notFound();
  const provider = getProvider(session.providerId);
  const ways = collectOptions(provider);
  const extras = openCharges(listCustomerCharges(person.id));
  const discounts = listCustomerDiscounts(person.id);
  const extraPlans = listCustomerExtraPlans(person.id);
  const due = invoiceFor(person, extras, { discounts, extraPlans }).due;
  const promo = query.promo ? findCataloguePromo(session.providerId, query.promo) : undefined;
  const promoMode = promo?.mode === "percent" || promo?.mode === "amount" ? promo.mode : undefined;
  const already = promo ? discounts.some((discount) => discount.name.toLowerCase() === promo.name.toLowerCase()) : false;
  const off = promo && promoMode && !already ? promoOff(due, promoMode, promo.value) : 0;
  const payable = Math.max(0, due - off);
  const nextDate = nextRenewalDate(person.renew_date, todayISO(), person.bill_cycle);
  const notice =
    query.notice === "gateway"
      ? "The payment gateway is not connected yet. Nothing was charged, the renewal is unchanged, and no receipt was issued."
      : query.notice;
  const online = allows(session.productPlan, "onlinePay") && due > 0;
  const showGateway = online && ways.gateway;
  const showUpi = online && ways.upi && !ways.gateway;
  const claim = latestUpiClaim(person.id);
  const sameBill = claim && claim.renew_date === person.renew_date;
  const waiting = sameBill && claim.status === "pending" ? claim : undefined;
  const refused = sameBill && claim.status === "rejected" ? claim : undefined;
  const payee = provider?.collect_payee || session.brandName;
  const link =
    showUpi && provider && !waiting
      ? upiLink({ upi: provider.collect_upi, payee, amount: payable, note: `${session.brandName} ${connectionId(person.id)}` })
      : "";
  const qr = link ? await QRCode.toString(link, { type: "svg", margin: 1, width: 196, color: { dark: "#14261e", light: "#ffffff" } }) : "";

  return (
    <>
      <p>
        <Link className="back" href="/subscriber">
          My connection
        </Link>
      </p>
      <header className="page-head pay-page-head">
        <div>
          <h1>Pay bill</h1>
        </div>
      </header>
      <Banner error={query.error} notice={notice} />
      <article className="card pay-card">
        <header className="pay-hero">
          <span className="pay-kicker">Amount due</span>
          <p className="pay-amount">{formatInr(payable)}</p>
          <p className="pay-sub">
            {person.plan_name} · {formatSpeed(person.speed_mbps)} · {billCycleLabel(person.bill_cycle).toLowerCase()} · due {formatDate(person.renew_date)}
          </p>
          {off > 0 && promo ? (
            <p className="pay-chip">
              <span>
                {promo.name} takes {formatInr(off)} off {formatInr(due)}
              </span>
              <Link href="/subscriber/pay">Remove</Link>
            </p>
          ) : null}
        </header>
        <div className="pay-body">
          <p className="pay-note">
            A confirmed payment moves the renewal {billCycleAdvance(person.bill_cycle)} ahead, to {formatDate(nextDate)}, and the receipt is issued then.
            {extras.length > 0 ? ` This bill adds ${extras.map((charge) => chargeSummary(charge)).join(", ")}.` : ""}
            {extraPlans.length > 0
              ? ` Also ${extraPlans.map((plan) => `${plan.plan_name} (${billCycleLabel(plan.bill_cycle).toLowerCase()})`).join(", ")}.`
              : ""}
            {billTaxNote(person)}
            {discounts.length > 0 ? ` Discounts: ${discounts.map((discount) => discountSummary(discount)).join(", ")}.` : ""}
          </p>
          {showGateway ? (
            <form action={payBill} className="pay-form">
              <PayMethods />
              <AddPromo code={off > 0 && promo ? promo.name : ""} action={applySubscriberPromo} />
              <SubmitButton className="btn primary pay-submit" pendingLabel="Contacting the gateway…">
                Pay {formatInr(payable)}
              </SubmitButton>
            </form>
          ) : null}
          {showUpi && waiting ? (
            <section className="pay-way">
              <h2>UPI payment sent</h2>
              <p className="pay-note">
                {formatInr(waiting.amount)} with UPI reference {waiting.utr} was sent on {formatStamp(waiting.created_at)}. {session.brandName} checks
                that the money arrived, then confirms it. The renewal moves and the receipt appears after that.
              </p>
            </section>
          ) : null}
          {showUpi && !waiting && provider ? (
            <section className="pay-way">
              <h2>Pay by UPI</h2>
              {refused ? (
                <p className="banner bad">
                  UPI reference {refused.utr} was not confirmed by {session.brandName}. If the money left your account, call them with that reference.
                </p>
              ) : null}
              <div className="upi-pay">
                <div className="upi-qr" aria-label="UPI QR code" dangerouslySetInnerHTML={{ __html: qr }} />
                <div className="upi-copy">
                  <p className="pay-note">
                    Scan with GPay, PhonePe, Paytm, or your bank app. {formatInr(payable)} and {connectionId(person.id)} are filled in.
                  </p>
                  <p className="upi-id">
                    <span>{payee}</span>
                    <strong>{provider.collect_upi}</strong>
                  </p>
                  <a className="btn upi-open" href={link}>
                    Pay with UPI app
                  </a>
                </div>
              </div>
              <AddPromo code={off > 0 && promo ? promo.name : ""} action={applySubscriberPromo} />
              <form action={sendUpiPayment} className="pay-form">
                <input type="hidden" name="promo" value={off > 0 && promo ? promo.name : ""} />
                <label className="field pay-field">
                  <span>UPI reference after paying</span>
                  <input
                    name="utr"
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    minLength={12}
                    maxLength={12}
                    pattern="[0-9]{12}"
                    title="The 12-digit UPI reference (UTR) from your UPI app"
                    placeholder="12-digit UPI reference"
                  />
                </label>
                <SubmitButton className="btn primary pay-submit" pendingLabel="Sending…">
                  I have paid {formatInr(payable)}
                </SubmitButton>
              </form>
            </section>
          ) : null}
          <section className="pay-way">
            <h2>Pay cash</h2>
            <p className="pay-note">
              Pay {formatInr(due)} at the {session.brandName} office or to the collection agent
              {session.supportPhone ? `, or call ${session.supportPhone}` : ""}. Give your connection ID, {connectionId(person.id)}. The provider records it on your
              line, and the renewal moves then.
            </p>
          </section>
        </div>
      </article>
    </>
  );
}
