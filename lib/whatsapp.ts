/** Sends a sign-in code on WhatsApp when the server has a WhatsApp connection. */

function digits(phone: string) {
  const raw = phone.replace(/\D/g, "");
  if (raw.length === 10) return `91${raw}`;
  return raw;
}

export function whatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim());
}

export async function sendWhatsAppCode(
  phone: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: "unconfigured" | "failed" }> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  if (!token || !phoneId) return { ok: false, reason: "unconfigured" };
  const to = digits(phone);
  if (to.length < 11) return { ok: false, reason: "failed" };
  const template = process.env.WHATSAPP_OTP_TEMPLATE?.trim();
  const body = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: `Your Zignal Connect sign-in code is ${code}. It works for 10 minutes. If you did not try to sign in, ignore this message.`,
        },
      };
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, reason: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
