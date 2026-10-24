import { mailConfigured, sendMail } from "@/lib/mail";

/**
 * Tells the people in ALERT_EMAIL (comma separated) when something breaks on the live site.
 * It uses the same mail account as everything else, so no extra service is needed.
 * The same problem is mailed at most once per cooldown, and no more than 10 mails go out per hour,
 * so a broken page cannot flood an inbox. Every error is also written to the server log.
 */

const globalForAlerts = globalThis as unknown as { alertSeen?: Map<string, number>; alertSent?: number[] };
const seen = (globalForAlerts.alertSeen ??= new Map<string, number>());
const sent = (globalForAlerts.alertSent ??= []);

const MAX_PER_HOUR = 10;

function recipients() {
  return (process.env.ALERT_EMAIL ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\S+@\S+\.\S+$/.test(item));
}

function describe(error: unknown) {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack ?? "" };
  return { message: String(error), stack: "" };
}

/** Next.js uses these to move to another page. They are not failures. */
function isNavigation(error: unknown) {
  const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest?: unknown }).digest) : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK");
}

/** A forgotten promise that fails would otherwise stop the whole server. Log it, tell the owner, and carry on. */
export function watchBackgroundTasks() {
  const globalForHook = globalThis as { rejectionHook?: boolean };
  if (globalForHook.rejectionHook) return;
  globalForHook.rejectionHook = true;
  process.on("unhandledRejection", (reason) => {
    void reportError("background task", reason);
  });
}

export async function reportError(where: string, error: unknown, options?: { cooldownMinutes?: number; detail?: string }) {
  if (isNavigation(error)) return;
  const { message, stack } = describe(error);
  console.error(`[alert] ${where}: ${message}`);

  const to = recipients();
  if (to.length === 0 || !mailConfigured()) return;

  const now = Date.now();
  const key = `${where}|${message.slice(0, 200)}`;
  const cooldown = (options?.cooldownMinutes ?? 30) * 60 * 1000;
  const last = seen.get(key);
  if (last && now - last < cooldown) return;
  while (sent.length > 0 && now - sent[0] > 60 * 60 * 1000) sent.shift();
  if (sent.length >= MAX_PER_HOUR) return;
  seen.set(key, now);
  sent.push(now);

  const lines = [
    `Where: ${where}`,
    `What: ${message}`,
    ...(options?.detail ? [`More: ${options.detail}`] : []),
    `When: ${new Date(now).toISOString()}`,
    "",
    stack.split("\n").slice(0, 8).join("\n"),
    "",
    "The same problem is not mailed again for a while. The full detail is in the Railway logs.",
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap;">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;
  for (const address of to) {
    // sendMail never throws. A failed alert is only logged, so reporting can never break a request.
    await sendMail(address, `[Zignal Connect] Problem on the live site: ${where}`, text, html);
  }
}
