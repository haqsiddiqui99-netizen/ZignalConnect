# Zignal Connect go-live checklist

Set these on Railway, then run the smoke test at the bottom.

## Must have before the first ISP

- [ ] **Persistent volume** mounted at `/app/data`. The database is `data/lumen.db`; without a volume every redeploy erases all ISP data.
- [ ] **Daily backup** of `data/lumen.db`.
- [ ] **Mail** so desk owners can sign in (they get a 6-digit code by email after the password):
  - `RESEND_API_KEY`
  - `SMTP_FROM` (an address on a domain verified in Resend)
- [ ] **`APP_URL`** = `https://www.zignalconnect.com` (used in links inside emails).
- [ ] **Zignal admin login** (`ops@zignal.connect`): confirm you know its password. The admin signs in with a password only, no emailed code.
- [ ] Production never loads the sample desk ("Lumen Fibre"). If the live database was created before this change, remove that desk and its eight sample subscribers, or they will receive renewal emails.

## Soon after

- [ ] **Razorpay live mode**: finish KYC, then set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Add the webhook `https://www.zignalconnect.com/api/razorpay/webhook`. Make one small real payment before the first trial ends.
- [ ] **Reminders**: the app already sends renewal reminders every hour from inside the running server. For a backup trigger set `CRON_SECRET` and call `/api/cron/reminders` with `Authorization: Bearer <secret>`.
- [ ] Optional: WhatsApp login codes and reminders (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_OTP_TEMPLATE`).
- [ ] Have the Terms, Privacy and Refund pages read against how you actually operate (GST, refunds, data).

## Smoke test on the live site

1. Open a desk from `/signup`, sign out, sign back in (the code email must arrive).
2. Import a subscriber sheet.
3. Record a payment and download the receipt.
4. Sign in as a subscriber and raise a complaint.
5. Redeploy, then check the data is still there.
