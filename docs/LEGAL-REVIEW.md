# Legal review brief (Terms, Privacy, Refund)

The three pages at `/terms`, `/privacy` and `/refund` are a **draft written by the product team, not by a lawyer**.
Please have a lawyer who knows Indian software and data-protection law read them before the service takes real
money or real subscriber data.

## What the service does (for the lawyer)

- Zignal Connect is software for small and mid-size ISPs. The ISP (the "desk") keeps its subscriber book, plans,
  renewals, receipts and complaints in it. Subscribers sign in to a portal.
- The ISP pays Zignal Connect a desk fee (Pro, Ultra, Premium; monthly, quarterly or yearly; GST added) through Razorpay.
- Subscribers pay the ISP by cash, or by UPI straight to the ISP's own UPI ID. Zignal Connect never holds that money.
- Personal data kept: subscriber name, email, mobile, address, plan, payments, UTR references, complaints; for the ISP
  owner: name, email, GSTIN, bank account, IFSC, PAN, router login. Bank account, PAN and router secrets are encrypted at rest.
- Processors: Railway (hosting), Resend (email), Razorpay (desk fee).

## Things to confirm or fill in

| Item | Where | Notes |
| --- | --- | --- |
| Legal name and address of the business | env `LEGAL_NAME`, `LEGAL_ADDRESS` | Pages show "Zignal Connect" with no address until set |
| City whose courts hear disputes | env `LEGAL_COURT_CITY` | Pages say "the courts in India that have jurisdiction" until set |
| Liability cap = fees paid in the last 12 months | Terms, "Limit of what we owe" | Is this cap enforceable and wise? |
| Replies within 7 days, requests done within 30 days | Privacy, "Your rights"; Refund, "How to ask" | These are promises. Only keep numbers the team can meet |
| Closed desk's book deleted within 30 days of the request | Privacy, "How long we keep it" | **Not automated yet.** Today it is a manual task |
| Refund to the original method in 5 to 7 working days | Refund | Depends on Razorpay and the bank |
| Role split: ISP decides for the subscriber book, Zignal processes for it; Zignal decides for the desk account | Privacy | Confirm the data fiduciary and processor split under the DPDP Act, 2023, and whether a data processing agreement is needed with each ISP |
| Where data is stored (country and region of the Railway volume) | Privacy | Not stated on the page. Cross-border rules may apply |
| GST registration and invoice format for the desk fee | Terms, Refund | Pages say a "receipt" is issued. A GST tax invoice may be required |
| Notification of a data breach | Privacy | Page promises to tell the ISP and the authority "where the law requires". Check the DPDP Rules |
| Grievance officer | Privacy | Currently the mailbox support@zignalconnect.com. Name a person if the law needs one |
| Consent and unsubscribe for renewal emails | Privacy | Renewal reminders go to subscribers on the ISP's behalf. Check whether they are service mail or promotion |
| Children's data | Not covered | Add a line if relevant |
| WhatsApp / SMS | Not connected | Terms and Privacy must be updated before they are |

## Not yet in the pages

- A separate data processing agreement between Zignal Connect and each ISP.
- An acceptable-use list in more detail than "do not break the law or send unwanted mail".
- A check-box at sign-up that records acceptance of the Terms (the sign-up page only links to them).
