import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { GRIEVANCE_EMAIL, legalParty } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Zignal Connect keeps about an ISP desk and its subscribers, and who can see it.",
  alternates: { canonical: "/privacy" },
};

// Read at request time so the business name set in the host's variables shows without a rebuild.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const party = legalParty();
  return (
    <SiteShell current="/privacy">
      <section className="site-hero">
        <p className="site-eyebrow">Privacy</p>
        <h1>What we keep, and who can see it.</h1>
        <p className="site-lede">This page covers the Zignal Connect desk and the subscriber portal. It was last updated on 24 October 2026.</p>
      </section>
      <article className="card site-card legal">
        <h2>The desk account</h2>
        <p>
          When an ISP opens a desk, we keep the ISP name, the owner&apos;s name and email, a password hash, the office
          address, the support number, the GSTIN if one is entered, the plan, and the billing term. We also keep the
          time of each sign-in.
        </p>
        <p>
          If the owner chooses to enter them, we also keep the UPI ID and payee name shown to subscribers, the bank
          account holder, account number, IFSC, and PAN, and the sign-in details of the ISP&apos;s router or billing
          database used to switch a line on or off. These are kept so the desk can collect payments and control
          lines. The bank account number, the PAN, and the router or database passwords are encrypted before they are
          stored in our database on our hosting provider&apos;s disk.
        </p>
        <p>
          Passwords are kept only as a hash. When the owner adds a staff login, the staff member gets an email with a
          link to choose their own password, so nobody else sees it. A new owner confirms the email by link before
          the desk opens, and a desk that is never confirmed is removed after a week.
        </p>
        <h2>The subscriber book</h2>
        <p>
          The desk stores each subscriber&apos;s name, email, mobile, service address, plan, renewal date, payments,
          receipts, and complaints. When a subscriber pays by UPI, the desk also keeps the 12-digit UTR reference the
          subscriber typed and whether the ISP confirmed it. That book belongs to the ISP. Zignal Connect keeps it so the desk and the
          subscriber portal can run.
        </p>
        <h2>Mail</h2>
        <p>
          A password reset sends one email to the address on the account, from support@zignalconnect.com. That message
          holds a link, not the password. A new subscriber receives a welcome email with their sign-in email and first
          password. Renewal emails go out 3 days before the due date and on the due date. Message and WhatsApp are not
          connected yet.
        </p>
        <h2>Sign-in</h2>
        <p>
          A signed-in browser holds a session cookie. It is marked so scripts on the page cannot read it. On the live
          site it is sent only over HTTPS. It expires after 12 hours.
        </p>
        <p>
          To stop password guessing and mail floods, we limit repeated wrong passwords, sign-in codes, password-reset
          requests, and new desks. For that we keep the email or network address and the time of each such attempt for
          about a day.
        </p>
        <h2>Who can see it</h2>
        <ul>
          <li>Staff on a desk see that desk&apos;s subscribers, payments, and complaints.</li>
          <li>A subscriber sees their own line, receipts, and complaints.</li>
          <li>Zignal sees support tickets raised from a desk.</li>
        </ul>
        <h2>What we do not do</h2>
        <p>We do not sell the subscriber book. We do not send office payments to a bank. A desk plan is paid through Razorpay, which handles the card or UPI details, and we never see or store them. A subscriber who pays by UPI pays the ISP&apos;s UPI ID directly, and that money does not pass through us. Online card collection for a subscriber bill is not connected yet.</p>
        <h2>Who decides what, and who keeps it</h2>
        <p>
          For the subscriber book, the ISP decides what is collected and why, and {party.name} keeps and processes it on
          the ISP&apos;s behalf so the desk and portal can run. For the desk account itself, such as the owner&apos;s email and
          the desk fee, {party.name} decides. A subscriber who wants to see or correct their details should ask their ISP
          first, and may also write to us.
        </p>
        <h2>Other companies that handle data for us</h2>
        <ul>
          <li>Railway hosts the service and the disk that holds the database.</li>
          <li>Resend delivers the emails the desk sends, so it sees the recipient address and the message.</li>
          <li>Razorpay takes the desk fee, and handles the card or UPI details itself.</li>
        </ul>
        <p>
          If a text or WhatsApp service is connected later, it will be added to this list before it is used.
        </p>
        <h2>Your rights</h2>
        <p>
          You may ask us what we keep about you, ask for a correction, ask for it to be deleted, or withdraw consent
          where we rely on it, as the Digital Personal Data Protection Act, 2023 allows. Write to{" "}
          <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a> from the email on the account. We will answer within
          7 days and complete the request within 30 days. If you are not satisfied with our answer, you may complain to
          the Data Protection Board of India.
        </p>
        <h2>If something goes wrong</h2>
        <p>
          If personal data on the service is exposed, we will tell the ISP that owns the book without delay, and we will
          report it to the authority where the law requires.
        </p>
        <h2>Cookies</h2>
        <p>The service sets one cookie, the sign-in cookie described above. It has no advertising or tracking cookies.</p>
        <h2>How long we keep it</h2>
        <p>
          The book stays while the desk is open. When the owner asks for the desk to be closed, its book is deleted within
          30 days of the request, except what the law asks us to keep, such as records of the desk fee we charged and
          the GST on it, which are kept for the period the law sets. To ask for a desk or a subscriber record to be
          removed, write to <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>.
        </p>
        <h2>Who we are</h2>
        <p>
          The service is run by {party.name}
          {party.address ? `, ${party.address}` : ""}. The person to write to about your data is the grievance contact at{" "}
          <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>. We may update this page, and the date at the top shows
          the latest version.
        </p>
        <p>
          The rules for using the desk are on the <Link href="/terms">Terms</Link> page. Fees already paid are covered
          on the <Link href="/refund">Refund</Link> page.
        </p>
      </article>
    </SiteShell>
  );
}
