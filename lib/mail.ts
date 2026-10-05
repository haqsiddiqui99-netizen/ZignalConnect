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
