import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

export type PasswordVia = "email" | "whatsapp" | "sms";

const BANNER_PATH = path.join(process.cwd(), "public", "email-banner.png");

export function isPasswordVia(value: string): value is PasswordVia {
  return value === "email" || value === "whatsapp" || value === "sms";
}

export function siteOrigin() {
  return (process.env.APP_URL || "https://www.zignalconnect.com").replace(/\/$/, "");
}

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function passwordResetMail(input: { ispName?: string; signoff: string; link: string; fromProvider?: boolean }) {
  const isp = input.ispName?.trim();
  const intro = input.fromProvider
    ? "Your provider asked for a new sign-in password."
    : "A new sign-in password was requested for this email.";
  const text = [
    intro,
    "",
    ...(isp ? [isp, ""] : []),
    "Open this link to set a new password. It works once, for 15 minutes.",
    input.link,
    "",
    "If you did not ask for this, ignore this email.",
    "",
    "Best wishes,",
    input.signoff,
  ].join("\n");
  const ispLine = isp
    ? `<p style="margin:22px 0 0;color:#b85c2a;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(isp)}</p>`
    : "";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3efe7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3efe7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf8;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#14261e;line-height:0;">
              <img src="cid:zignal-banner" alt="Zignal Connect" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;font-family:Georgia,Palatino,serif;color:#1c1916;">
              ${ispLine}
              <p style="margin:22px 0 0;font-size:18px;line-height:1.5;">${escapeHtml(intro)}</p>
              <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">Open the button to set a new password. The link works once, for 15 minutes.</p>
              <p style="margin:22px 0 0;">
                <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#14261e;color:#f6f1e8;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px;">Set a new password</a>
              </p>
              <p style="margin:18px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.5;color:#6f675e;">If the button does not open, copy this link into your browser:<br />${escapeHtml(input.link)}</p>
              <p style="margin:18px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.5;color:#6f675e;">If you did not ask for this, ignore this email.</p>
              <p style="margin:28px 0 0;font-size:16px;line-height:1.4;">Best wishes,<br />${escapeHtml(input.signoff)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject: "Set a new Zignal Connect password", text, html };
}

function letter(input: { ispName?: string; signoff: string; subject: string; text: string; blocks: string }) {
  const isp = input.ispName?.trim();
  const ispLine = isp
    ? `<p style="margin:22px 0 0;color:#b85c2a;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(isp)}</p>`
    : "";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3efe7;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3efe7;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf8;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#14261e;line-height:0;">
              <img src="cid:zignal-banner" alt="Zignal Connect" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;font-family:Georgia,Palatino,serif;color:#1c1916;">
              ${ispLine}
              ${input.blocks}
              <p style="margin:28px 0 0;font-size:16px;line-height:1.4;">Best wishes,<br />${escapeHtml(input.signoff)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject: input.subject, text: input.text, html };
}

export function welcomeMail(input: { ispName: string; email: string; password: string }) {
  const origin = siteOrigin();
  const text = [
    `Welcome to ${input.ispName}.`,
    "",
    "Your subscriber portal is ready. Sign in with these details:",
    `Email: ${input.email}`,
    `Password: ${input.password}`,
    origin,
    "",
    "Best wishes,",
    input.ispName,
  ].join("\n");
  const blocks = `
    <p style="margin:22px 0 0;font-size:18px;line-height:1.5;">Welcome to ${escapeHtml(input.ispName)}.</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">Your subscriber portal is ready. Sign in with these details:</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;">Email<br /><strong>${escapeHtml(input.email)}</strong></p>
    <p style="margin:10px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;">Password<br /><strong>${escapeHtml(input.password)}</strong></p>
    <p style="margin:22px 0 0;">
      <a href="${escapeHtml(origin)}" style="display:inline-block;background:#14261e;color:#f6f1e8;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px;">Sign in</a>
    </p>`;
  return letter({ ispName: input.ispName, signoff: input.ispName, subject: `Welcome to ${input.ispName}`, text, blocks });
}

export function deskWelcomeMail(input: {
  ispName: string;
  ownerName: string;
  email: string;
  plan: string;
  trialEnds: string;
  fee: string;
}) {
  const origin = siteOrigin();
  const text = [
    `Welcome to Zignal Connect, ${input.ownerName}.`,
    "",
    `Your desk for ${input.ispName} is open.`,
    `Plan: ${input.plan}`,
    `The trial runs until ${input.trialEnds}. The first desk fee of ${input.fee} is booked for that day. No card is charged during the trial.`,
    "",
    "Sign in with:",
    `Email: ${input.email}`,
    "Password: the one you chose when you opened the desk.",
    origin,
    "",
    "Best wishes,",
    "Zignal Connect",
  ].join("\n");
  const blocks = `
    <p style="margin:22px 0 0;font-size:18px;line-height:1.5;">Welcome to Zignal Connect, ${escapeHtml(input.ownerName)}.</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">Your desk for ${escapeHtml(input.ispName)} is open.</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;">Plan<br /><strong>${escapeHtml(input.plan)}</strong></p>
    <p style="margin:10px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;">Trial until<br /><strong>${escapeHtml(input.trialEnds)}</strong></p>
    <p style="margin:10px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;">First desk fee<br /><strong>${escapeHtml(input.fee)}</strong></p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">That fee is booked for the end of the trial. No card is charged during the trial.</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;">Email<br /><strong>${escapeHtml(input.email)}</strong></p>
    <p style="margin:10px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">Use the password you chose when you opened the desk.</p>
    <p style="margin:22px 0 0;">
      <a href="${escapeHtml(origin)}" style="display:inline-block;background:#14261e;color:#f6f1e8;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px;">Sign in</a>
    </p>`;
  return letter({ ispName: input.ispName, signoff: "Zignal Connect", subject: "Welcome to Zignal Connect", text, blocks });
}

export function loginCodeMail(code: string) {
  const text = [
    "Your Zignal Connect sign-in code is:",
    code,
    "",
    "It works for 10 minutes. If you did not try to sign in, ignore this email.",
    "",
    "Best wishes,",
    "Zignal Connect",
  ].join("\n");
  const blocks = `
    <p style="margin:22px 0 0;font-size:18px;line-height:1.5;">Use this code to finish signing in.</p>
    <p style="margin:18px 0 0;font-family:Georgia,Palatino,serif;font-size:32px;letter-spacing:0.28em;">${escapeHtml(code)}</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">It works for 10 minutes. If you did not try to sign in, ignore this email.</p>`;
  return letter({ signoff: "Zignal Connect", subject: "Your Zignal Connect sign-in code", text, blocks });
}

export function renewalMail(input: { ispName: string; signoff: string; title: string; body: string }) {
  const text = [input.title, "", input.body, "", "Best wishes,", input.signoff].join("\n");
  const blocks = `
    <p style="margin:22px 0 0;font-size:18px;line-height:1.5;">${escapeHtml(input.title)}</p>
    <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#6f675e;">${escapeHtml(input.body)}</p>`;
  return letter({ ispName: input.ispName, signoff: input.signoff, subject: input.title, text, blocks });
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<{ ok: true } | { ok: false; reason: "unconfigured" | "failed" }> {
  if (!mailConfigured()) return { ok: false, reason: "unconfigured" };
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER?.trim();
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: user ? { user, pass: process.env.SMTP_PASS || "" } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
      attachments: html && fs.existsSync(BANNER_PATH) ? [{ filename: "banner.png", path: BANNER_PATH, cid: "zignal-banner" }] : [],
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
