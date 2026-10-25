import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { GRIEVANCE_EMAIL, legalParty } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for an ISP desk and subscriber portal on Zignal Connect.",
  alternates: { canonical: "/terms" },
};

// Read at request time so the business name set in the host's variables shows without a rebuild.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const party = legalParty();
  return (
    <SiteShell current="/terms">
      <section className="site-hero">
        <p className="site-eyebrow">Terms</p>
        <h1>The rules for using a desk.</h1>
        <p className="site-lede">These terms apply when an ISP opens a desk or a subscriber signs in to a portal. They were last updated on 24 October 2026.</p>
      </section>
      <article className="card site-card legal">
        <h2>The service</h2>
        <p>
          Zignal Connect is software for an ISP office: the subscriber book, plans, renewals, receipts, complaints, and
          a portal that shows the ISP&apos;s name. It is not a bank and it does not provide the internet line.
        </p>
        <h2>Who may open a desk</h2>
        <p>
          The person who opens a desk must be allowed to keep that ISP&apos;s subscriber records. Staff logins are
          created by the desk owner. A subscriber signs in only to their own line.
        </p>
        <h2>Plans</h2>
        <p>
          Pro holds up to 500 subscribers, Ultra up to 1,000, and Premium from 3,000 to 30,000. Every plan starts with
          a 30-day trial. Monthly is the list price. Quarterly is 10% off, and yearly is two months free (you pay for 10 months and get 12). GST is added
          on top of that fee. The prices on the <Link href="/pricing">Pricing</Link> page are the plan fees.
        </p>
        <h2>Payments</h2>
        <p>
          A payment recorded at the office stays in the desk ledger and moves the renewal date. Zignal Connect does not
          take that money. A desk plan is paid online through Razorpay, and Zignal Connect never sees or stores the
          card number.
        </p>
        <p>
          An ISP may add its own UPI ID. The subscriber&apos;s Pay page then shows a QR code that sends money straight
          from the subscriber&apos;s UPI app to that UPI ID. The subscriber then types the 12-digit UTR reference, and the
          ISP checks its own bank statement and confirms or rejects the payment. Zignal Connect does not receive, hold,
          check, or refund that money, and is not a party to it. Online card collection for a subscriber bill is not
          connected yet, so nothing is charged to a subscriber&apos;s card.
        </p>
        <h2>The subscriber book</h2>
        <p>
          The ISP is responsible for the names, mobiles, addresses, and payment notes it enters, for the UPI ID it adds
          being correct and its own, and for the money it collects from subscribers. What we store, and who can see it, is on the <Link href="/privacy">Privacy</Link>{" "}
          page.
        </p>
        <h2>Fair use</h2>
        <p>Do not use a desk to break the law, to send mail the recipient did not ask for, or to open a line for someone else&apos;s subscribers.</p>
        <h2>Fees, GST and price changes</h2>
        <p>
          A desk fee is charged in rupees for the term the owner picks, and GST is added at the rate in force. A receipt
          is issued for each desk fee paid. If the fee for a plan changes, the new fee applies from the next term
          after we give notice by email, and never to a term that has already been paid.
        </p>
        <h2>Suspension and ending</h2>
        <p>
          If a desk fee is not paid when the trial or a paid term ends, the desk can be limited or paused until
          it is paid. We may suspend a desk at once if it is used to break the law, to send unwanted mail, to attack the
          service, or to enter other people&apos;s data without the right to do so. The owner may close the desk at any
          time. After a desk is closed, its book is kept or deleted as described on the <Link href="/privacy">Privacy</Link> page.
        </p>
        <h2>The service as it is</h2>
        <p>
          We work to keep the service running and the data safe, and we keep backups, but the service is provided as it
          is. We do not promise it will never be down or free of error, and the ISP should keep its own copy of its
          subscriber book and bank records. The ISP is responsible for checking each payment against its own bank
          statement before it confirms one.
        </p>
        <h2>Limit of what we owe</h2>
        <p>
          To the extent the law allows, we are not liable for lost profit, lost data, a missed renewal, a subscriber
          line left on or off, or any indirect loss. Our total liability for a claim about the service is limited to the
          desk fee the ISP paid us in the 12 months before the event. Nothing here limits a liability the law does not
          allow us to limit.
        </p>
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms. The date at the top shows the latest version. For a change that matters, we will
          email the desk owner. Using the desk after a change takes effect means the owner accepts it. An owner who does
          not accept it can close the desk.
        </p>
        <h2>Law and courts</h2>
        <p>
          These terms are governed by the laws of India. A dispute that cannot be settled by talking first goes to{" "}
          {party.courts}.
        </p>
        <h2>Who we are</h2>
        <p>
          The service is run by {party.name}
          {party.address ? `, ${party.address}` : ""}. Write to{" "}
          <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>.
        </p>
        <h2>Stopping a desk</h2>
        <p>
          An owner can ask for the desk to be closed by writing to{" "}
          <a href="mailto:support@zignalconnect.com">support@zignalconnect.com</a>. A fee already paid for a term that
          has started is covered on the <Link href="/refund">Refund</Link> page.
        </p>
      </article>
    </SiteShell>
  );
}
