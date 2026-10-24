# Zignal Connect go-live checklist

Set these on Railway, then run the smoke test at the bottom.

## Must have before the first ISP

- [ ] **Persistent volume** mounted at `/app/data`. The database is `data/lumen.db`; without a volume every redeploy erases all ISP data.
- [ ] **Daily backup** of `data/lumen.db`.
- [ ] **Mail** so desk owners can sign in (they get a 6-digit code by email after the password):
  - `RESEND_API_KEY`
  - `SMTP_FROM` (an address on a domain verified in Resend)
- [ ] **`APP_URL`** = `https://www.zignalconnect.com` (used in links inside emails).
- [ ] **`DATA_KEY`**: a long random value (32+ characters) that encrypts each desk's bank account, PAN and router passwords. Set it before the first desk saves them, and **never change or remove it afterwards**: without the same key those fields cannot be read and owners must type them in again. Keep a copy somewhere safe, outside Railway. If it is not set, the app uses a key file at `data/data.key` on the volume, which protects less (a copy of the whole volume would include the key).
- [ ] **`ALERT_EMAIL`**: your own address (several allowed, comma separated). When a page, a form, or the reminder job fails on the live site, the app emails it there. The same problem is mailed at most once per 30 minutes (6 hours for failed reminder emails), and never more than 10 mails an hour.
- [ ] **Uptime monitor**: add a free check (for example UptimeRobot) on `https://www.zignalconnect.com/api/health`, every 5 minutes, alerting your email or phone. It answers `{"ok":true}` only when the server is up and the database opens. Railway also uses this address for its deploy check.
- [ ] **Zignal admin login** (`ops@zignal.connect`): confirm you know its password. The admin signs in with a password only, no emailed code.
- [ ] Production never loads the sample desk ("Lumen Fibre"). If the live database was created before this change, remove that desk and its eight sample subscribers, or they will receive renewal emails.

## Soon after

- [ ] **Razorpay live mode**: finish KYC, then set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Add the webhook `https://www.zignalconnect.com/api/razorpay/webhook`. Make one small real payment before the first trial ends.
- [ ] **Reminders**: the app already sends renewal reminders every hour from inside the running server. For a backup trigger set `CRON_SECRET` and call `/api/cron/reminders` with `Authorization: Bearer <secret>`.
- [ ] Optional: WhatsApp login codes and reminders (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_OTP_TEMPLATE`).
- [ ] Have the Terms, Privacy and Refund pages read against how you actually operate (GST, refunds, data).

## Smoke test on the live site

1. Open a desk from `/signup`. A "confirm your email" mail arrives; open the link, press the button, and the desk opens. Sign out, sign back in (the code email must arrive). Add a staff member and check they get a "set your password" email.
2. Import a subscriber sheet.
3. Record a payment and download the receipt.
4. Sign in as a subscriber and raise a complaint.
5. Redeploy, then check the data is still there.
