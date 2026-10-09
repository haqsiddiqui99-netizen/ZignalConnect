"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authenticate, clearSession, getSession, requireOperator, requireRole, setSession } from "@/lib/auth";
import { LOGIN_CODE_ENABLED, beginLoginCode, checkLoginCode, dropLoginCode, replaceLoginCode } from "@/lib/login-code";
import { normalizeDate, parsePlanCsv, wholeUnits } from "@/lib/csv";
import crypto from "crypto";
import { execFile } from "node:child_process";
import { getDb, many, one, run } from "@/lib/db";
import {
  allows,
  BILL_TERMS,
  CATALOG,
  customerLimit,
  isBillTerm,
  isProductPlan,
  limitLabel,
  minimumPlan,
  planFamily,
  planFitsBase,
  quotePremium,
  termQuote,
  type BillTerm,
  type ProductPlan,
} from "@/lib/entitlements";
import {
  addDays,
  formatDate,
  formatInr,
  isDate,
  makeRef,
  nowStamp,
  todayISO,
} from "@/lib/format";
import { deskWelcomeMail, isPasswordVia, loginCodeMail, mailConfigured, passwordResetMail, renewalMail, sendMail, siteOrigin, welcomeMail } from "@/lib/mail";
import { deskClosedMessage, latestQuitDate, settleDesk } from "@/lib/desk-close";
import { hashPassword, newSubscriberPassword, verifyPassword } from "@/lib/password";
import { complaintCode, complaintIsFinished, isComplaintStatus, slaHoursFor } from "@/lib/complaints";
import { isLineStatus, type LineStatus } from "@/lib/line-status";
import { pushLine } from "@/lib/line-link";
import {
  billCycleFromImport,
  cycleAmount,
  incompleteCycleCharge,
  isBillCycle,
  remindersFromImport,
  renewalAfterInstallation,
  type BillCycle,
} from "@/lib/bill-cycle";
import { cleanGstin, gstIncluded, gstMode, isGstin, isIndianState } from "@/lib/tax";
import { collectSubscriberPayment, collectUpgradePayment, markUpgradePaid, orderPayable, promoOff, type UpgradeOrder } from "@/lib/checkout";
import { readGatewayPayment, savedPaymentLine } from "@/lib/pay-instrument";
import { syncDeskOverflow } from "@/lib/receipts";
import { promiseAllowed, promiseWindow, renewalAfterPayment } from "@/lib/promise-pay";
import { nextDeskFeeDate, postDeskWelcome, postOnboardingMessage, sendDeskNote } from "@/lib/renewals";
import { readCatalogueWorkbook, type SheetRow } from "@/lib/catalogue-book";
import { blankChargeAmount, invoiceFor, parseChargeTax, readBillSettings, readBillTax, readCharges, readDiscounts, readPlanLines } from "@/lib/charges";
import { readCustomerWorkbook } from "@/lib/customer-book";
import { paymentSource, readPaymentWorkbook } from "@/lib/payment-book";
import { accountCategoryFromImport, findCataloguePromo, findPlanCoupon, getPlatformProfile, getProvider, getSubscriber, getSubscriberByUserId, getUsage, isAccountCategory, listCustomerCharges, listOpenDesks, listCustomerDiscounts, listCustomerExtraPlans, SUPPORT_PRIORITIES, SUPPORT_TOPICS } from "@/lib/queries";
import { SUPPORT_STATUSES, supportIsFinished } from "@/lib/support";

function go(path: string, params?: Record<string, string>): never {
  if (!params) redirect(path);
  const [base, existing = ""] = path.split("?");
  const query = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const text = query.toString();
  redirect(text ? `${base}?${text}` : base);
}

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/provider");
  revalidatePath("/provider/subscriber");
  revalidatePath("/provider/plans");
  revalidatePath("/provider/revenue");
  revalidatePath("/provider/import");
  revalidatePath("/provider/payments");
  revalidatePath("/provider/upgrade");
  revalidatePath("/provider/team");
  revalidatePath("/provider/reports");
  revalidatePath("/provider/complaints");
  revalidatePath("/provider/support");
  revalidatePath("/provider/settings");
  revalidatePath("/zignal");
  revalidatePath("/zignal/mail");
  revalidatePath("/zignal/support");
  revalidatePath("/zignal/revenue");
  revalidatePath("/zignal/settings");
  revalidatePath("/subscriber");
  revalidatePath("/subscriber/pay");
  revalidatePath("/subscriber/receipts");
  revalidatePath("/subscriber/complaints");
}

export async function login(formData: FormData) {
  const email = readText(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = authenticate(email, password);
  if (!user) go("/", { error: "Those credentials do not match an account." });
  if (user.kind === "desk") {
    const closed = deskClosedMessage(user.id);
    if (closed) go("/", { error: closed });
  }
  if (!LOGIN_CODE_ENABLED) {
    await setSession(user.id, user.kind);
    if (user.kind === "operator") redirect("/zignal");
    redirect(user.role === "admin" ? "/provider" : "/subscriber");
  }
  if (!mailConfigured()) go("/", { error: "Sign-in email is not connected yet. Add the mail account, then try again." });
  const code = await beginLoginCode({ userId: user.id, kind: user.kind, email: user.email });
  const mail = loginCodeMail(code);
  const sent = await sendMail(user.email, mail.subject, mail.text, mail.html);
  if (!sent.ok) {
    await dropLoginCode();
    go("/", { error: "The sign-in code could not be sent. Try again in a little while." });
  }
  redirect("/?step=code");
}

export async function confirmLogin(formData: FormData) {
  if (!LOGIN_CODE_ENABLED) redirect("/");
  const code = readText(formData, "code").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) go("/?step=code", { error: "Enter the 6-digit code from your email." });
  const result = await checkLoginCode(code);
  if (!result.ok) {
    const error =
      result.reason === "mismatch"
        ? "That code does not match. Try again."
        : "That sign-in code has expired. Sign in again.";
    go(result.reason === "mismatch" ? "/?step=code" : "/", { error });
  }
  if (result.kind === "desk") {
    const closed = deskClosedMessage(result.userId);
    if (closed) go("/", { error: closed });
  }
  await setSession(result.userId, result.kind);
  if (result.kind === "operator") redirect("/zignal");
  const person = one<{ role: string }>("SELECT role FROM users WHERE id = ?", result.userId);
  redirect(person?.role === "admin" ? "/provider" : "/subscriber");
}

export async function resendLoginCode() {
  if (!LOGIN_CODE_ENABLED) redirect("/");
  if (!mailConfigured()) go("/?step=code", { error: "Sign-in email is not connected yet. Add the mail account, then try again." });
  const next = await replaceLoginCode();
  if (!next.ok) {
    go(next.reason === "soon" ? "/?step=code" : "/", {
      error: next.reason === "soon" ? "Wait a moment before asking for another code." : "That sign-in code has expired. Sign in again.",
    });
  }
  const mail = loginCodeMail(next.code);
  const sent = await sendMail(next.email, mail.subject, mail.text, mail.html);
  if (!sent.ok) go("/?step=code", { error: "The sign-in code could not be sent. Try again in a little while." });
  redirect("/?step=code&notice=sent");
}

export async function cancelLogin() {
  await dropLoginCode();
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/");
}

type SubscriberInput = {
  name: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  pincode: string;
  state: string;
  country: string;
  planId: number;
  planLabel: string;
  renewDate: string;
  installationDate: string;
  status: LineStatus;
  notes: string;
  area: string;
  billCycle: BillCycle;
  reminders: number;
  lineName: string;
  accountCategory: string;
  disconnectUnpaid: number;
};

function readSubscriberInput(
  formData: FormData,
  providerId: number,
  plan: ProductPlan,
  options?: { defaultStatus?: LineStatus },
): { ok: true; value: SubscriberInput } | { ok: false; error: string } {
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const mobile = readText(formData, "mobile").replace(/\s+/g, "");
  const address = readText(formData, "address");
  const city = readText(formData, "city");
  const pincode = readText(formData, "pincode").replace(/\s+/g, "");
  const state = readText(formData, "state");
  const country = readText(formData, "country");
  const planToken = String(formData.get("plan_id") ?? "");
  const planLabel = String(formData.get("plan_custom_name") ?? "").trim();
  const planId = planToken === "__custom__" ? 0 : Number(planToken);
  const renewDate = readText(formData, "renew_date");
  const installationDate = readText(formData, "installation_date");
  const status = readText(formData, "status") || options?.defaultStatus || "";
  const notes = readText(formData, "notes");
  const area = allows(plan, "areas") ? readText(formData, "area") : "";
  const billCycle = readText(formData, "bill_cycle");
  const reminders = readText(formData, "reminders") === "off" ? 0 : 1;
  const lineName = readText(formData, "line_name");
  const accountCategory = readText(formData, "account_category");
  const disconnectUnpaid = readText(formData, "disconnect_unpaid") === "yes" ? 1 : 0;

  if (name.length < 2) return { ok: false, error: "Enter the subscriber's name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email for the portal login." };
  if (!/^[6-9]\d{9}$/.test(mobile)) return { ok: false, error: "Enter a 10-digit mobile number." };
  if (address.length < 4) return { ok: false, error: "Enter the service address." };
  if (!/^\d{6}$/.test(pincode)) return { ok: false, error: "Enter a 6-digit PIN code." };
  if (city.length < 2) return { ok: false, error: "Enter the city." };
  if (state.length < 2 || state.length > 60) return { ok: false, error: "Enter the state." };
  if (country.length < 2 || country.length > 40) return { ok: false, error: "Enter the country." };
  if (planToken === "__custom__") {
    if (planLabel.length < 2 || planLabel.length > 40) return { ok: false, error: "Name the custom internet plan in a few words." };
  } else if (!Number.isInteger(planId) || planId <= 0) return { ok: false, error: "Choose a plan." };
  if (!isDate(renewDate) || !isDate(installationDate)) return { ok: false, error: "Enter both dates." };
  if (!isLineStatus(status)) return { ok: false, error: "Choose a line status." };
  if (!isBillCycle(billCycle)) return { ok: false, error: "Choose a bill cycle." };
  if (notes.length > 500) return { ok: false, error: "Keep notes under 500 characters." };
  if (area.length > 80) return { ok: false, error: "Keep the area name short." };
  if (lineName && !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/.test(lineName)) {
    return { ok: false, error: "Use the PPPoE username from the router: letters, numbers, and . _ @ -." };
  }
  if (!isAccountCategory(accountCategory)) return { ok: false, error: "Choose an account category." };
  if (planId && !one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", planId, providerId)) {
    return { ok: false, error: "That plan is no longer on the catalogue." };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      mobile,
      address,
      city,
      pincode,
      state,
      country,
      planId,
      planLabel,
      renewDate,
      installationDate,
      status,
      notes,
      area,
      billCycle,
      reminders,
      lineName,
      accountCategory,
      disconnectUnpaid,
    },
  };
}

async function syncNetworkLine(providerId: number, lineName: string, up: boolean, options?: { quietIfIdle?: boolean }) {
  const provider = getProvider(providerId);
  const kind = provider?.line_kind === "mikrotik" || provider?.line_kind === "radius" ? provider.line_kind : "";
  if (!kind) {
    return options?.quietIfIdle
      ? { state: "idle" as const, detail: "" }
      : { state: "idle" as const, detail: "Connect the network box in Settings to change the line." };
  }
  if (!lineName) return { state: "error" as const, detail: "Add the PPPoE username to change this line on the network." };
  return pushLine(
    {
      kind,
      host: provider?.line_host ?? "",
      port: provider?.line_port ?? 0,
      user: provider?.line_user ?? "",
      secret: provider?.line_secret ?? "",
      database: provider?.line_db ?? "",
      coaSecret: provider?.line_coa ?? "",
    },
    lineName,
    up,
  );
}

function insertCustomPlan(providerId: number, amount: number) {
  const name = `custom:${providerId}:${Date.now()}:${Math.floor(Math.random() * 1_000_000)}`;
  const row = run(
    "INSERT INTO plans (provider_id, name, speed_mbps, price, data_cap, description, listed) VALUES (?, ?, 0, ?, '', '', 0)",
    providerId,
    name,
    amount,
  );
  return Number(row.lastInsertRowid);
}

function readPinDirectory(pincode: string) {
  const url = `https://api.postalpincode.in/pincode/${pincode}`;
  const parse = (body: string) => JSON.parse(body) as {
    Status?: string;
    PostOffice?: { District?: string; State?: string; Country?: string; Name?: string }[] | null;
  }[];
  return fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parse(await response.text());
    })
    .catch(
      () =>
        new Promise<ReturnType<typeof parse>>((resolve, reject) => {
          if (process.platform !== "win32") {
            reject(new Error("directory"));
            return;
          }
          execFile(
            "curl.exe",
            ["-fsS", "--max-time", "20", url],
            { windowsHide: true, maxBuffer: 2_000_000 },
            (error, stdout) => {
              if (error) reject(error);
              else {
                try {
                  resolve(parse(stdout));
                } catch (parseError) {
                  reject(parseError);
                }
              }
            },
          );
        }),
    );
}

async function findPincode(pin: string) {
  const pincode = pin.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(pincode)) return { ok: false as const, error: "Enter a 6-digit PIN code." };
  try {
    const payload = await readPinDirectory(pincode);
    const offices = payload?.[0]?.Status === "Success" ? payload[0].PostOffice ?? [] : [];
    const counts = new Map<string, { n: number; state: string; country: string }>();
    for (const office of offices) {
      const city = (office.District || office.Name || "").trim();
      const state = (office.State || "").trim();
      if (!city || !state) continue;
      const current = counts.get(city);
      counts.set(city, { n: (current?.n ?? 0) + 1, state: current?.state || state, country: current?.country || (office.Country || "").trim() || "India" });
    }
    const place = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (!place) return { ok: false as const, error: "No place was found for this PIN code. Enter the city, state, and country." };
    return { ok: true as const, city: place[0], state: place[1].state, country: place[1].country || "India" };
  } catch {
    return { ok: false as const, error: "The PIN code directory did not respond. Enter the city, state, and country." };
  }
}

export async function lookupPincode(pin: string) {
  await requireRole("admin");
  return findPincode(pin);
}

export async function lookupOpenDeskPincode(pin: string) {
  return findPincode(pin);
}

function trialBlock(usage: ReturnType<typeof getUsage>) {
  if (!usage.trial.ended) return "";
  return `The ${usage.catalog.label} trial ended on ${formatDate(usage.trial.ends)}. This desk stays on ${usage.catalog.label} (${limitLabel(usage.customerCap)} subscribers). Adding subscribers is paused. Existing lines can still be billed.`;
}

function capBlock(usage: ReturnType<typeof getUsage>) {
  if (usage.customers < usage.overflowCap) return "";
  return `${usage.catalog.label} includes ${limitLabel(usage.customerCap)} subscribers, with a 10% overflow up to ${limitLabel(usage.overflowCap)}. Move to the next tier to add more.`;
}

export async function createSubscriber(formData: FormData) {
  const session = await requireRole("admin");
  const usage = getUsage(session.providerId);
  const paused = trialBlock(usage);
  if (paused) go("/provider/subscriber/new", { error: paused });
  const full = capBlock(usage);
  if (full) go("/provider/subscriber/new", { error: full });
  const parsed = readSubscriberInput(formData, session.providerId, session.productPlan, { defaultStatus: "active" });
  if (!parsed.ok) go("/provider/subscriber/new", { error: parsed.error });
  const charges = readCharges(formData);
  if (!charges.ok) go("/provider/subscriber/new", { error: charges.error });
  const billing = readBillSettings(formData);
  if (!billing.ok) go("/provider/subscriber/new", { error: billing.error });
  const discounts = readDiscounts(formData);
  if (!discounts.ok) go("/provider/subscriber/new", { error: discounts.error });
  const planLines = readPlanLines(formData);
  if (!planLines.ok) go("/provider/subscriber/new", { error: planLines.error });
  const input = {
    ...parsed.value,
    renewDate: renewalAfterInstallation(parsed.value.installationDate, parsed.value.billCycle),
  };
  for (const plan of planLines.plans) {
    if (!plan.planId) continue;
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", plan.planId, session.providerId)) {
      go("/provider/subscriber/new", { error: "That plan is no longer on the catalogue." });
    }
  }
  for (const discount of discounts.discounts) {
    if (!discount.appliesTo.startsWith("plan:")) continue;
    const planId = Number(discount.appliesTo.slice(5));
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", planId, session.providerId)) {
      go("/provider/subscriber/new", { error: "That plan is no longer on the catalogue." });
    }
  }

  if (one("SELECT id FROM users WHERE email = ?", input.email)) {
    go("/provider/subscriber/new", { error: "That email is already used for a login." });
  }

  const password = newSubscriberPassword();
  const db = getDb();
  let customerId = 0;
  db.exec("BEGIN");
  try {
    const user = run(
      "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'customer', ?, ?, ?, 0)",
      input.email,
      hashPassword(password),
      input.name,
      nowStamp(),
      session.providerId,
    );
    const customer = run(
      `INSERT INTO customers
        (user_id, mobile, address, city, pincode, state, country, status, plan_id, renew_date, installation_date, notes, area, bill_cycle, reminders,
         account_category, disconnect_unpaid,
         plan_frequency, plan_tax_included, plan_tax_percent, invoice_tax_included, invoice_tax_percent, plan_amount, plan_cycle, plan_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Number(user.lastInsertRowid),
      input.mobile,
      input.address,
      input.city,
      input.pincode,
      input.state,
      input.country,
      input.status,
      input.planId || insertCustomPlan(session.providerId, planLines.amount),
      input.renewDate,
      input.installationDate,
      input.notes,
      input.area,
      input.billCycle,
      input.reminders,
      input.accountCategory,
      input.disconnectUnpaid,
      billing.planFrequency,
      billing.planTaxIncluded ? 1 : 0,
      billing.planTaxPercent,
      billing.invoiceTaxIncluded ? 1 : 0,
      billing.invoiceTaxPercent,
      planLines.amount,
      planLines.cycle,
      input.planLabel,
    );
    customerId = Number(customer.lastInsertRowid);
    run("UPDATE customers SET line_name = ? WHERE id = ?", input.lineName, customerId);
    for (const charge of charges.charges) {
      run(
        "INSERT INTO customer_charges (customer_id, kind, label, frequency, bill_cycle, amount, tax_included, tax_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        customerId,
        charge.kind,
        charge.label,
        charge.frequency,
        charge.billCycle,
        charge.amount,
        charge.taxIncluded ? 1 : 0,
        charge.taxPercent,
      );
    }
    for (const discount of discounts.discounts) {
      run(
        "INSERT INTO customer_discounts (customer_id, name, applies_to, mode, frequency, value) VALUES (?, ?, ?, ?, ?, ?)",
        customerId,
        discount.name,
        discount.appliesTo,
        discount.mode,
        discount.frequency,
        discount.value,
      );
    }
    for (const plan of planLines.plans) {
      run(
        "INSERT INTO customer_extra_plans (customer_id, plan_id, bill_cycle, amount, tax_included, tax_percent, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
        customerId,
        plan.planId || insertCustomPlan(session.providerId, plan.amount),
        plan.billCycle,
        plan.amount,
        plan.taxIncluded ? 1 : 0,
        plan.taxPercent,
        plan.customName,
      );
    }
    postOnboardingMessage(customerId, session.providerId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const welcome = welcomeMail({ ispName: session.brandName, email: input.email, password });
  const mailed = await sendMail(input.email, welcome.subject, welcome.text, welcome.html);
  const line = input.lineName ? await syncNetworkLine(session.providerId, input.lineName, input.status === "active") : { detail: "" };
  syncDeskOverflow(session.providerId);
  refresh();
  const notice = mailed.ok
    ? `Subscriber added. A welcome email with the sign-in details was sent to ${input.email}.`
    : `Subscriber added. The welcome email could not be sent to ${input.email}. Use Send reset link.`;
  go(`/provider/subscriber/${customerId}`, { notice: line.detail ? `${notice} ${line.detail}` : notice });
}

export async function updateSubscriber(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  const parsed = readSubscriberInput(formData, session.providerId, session.productPlan);
  if (!parsed.ok) go(`/provider/subscriber/${id}`, { error: parsed.error });
  const input = parsed.value;

  const renewDate =
    input.installationDate !== current.installation_date || input.billCycle !== current.bill_cycle
      ? renewalAfterInstallation(input.installationDate, input.billCycle)
      : current.renew_date;
  const clash = one<{ id: number }>("SELECT id FROM users WHERE email = ? AND id != ?", input.email, current.user_id);
  if (clash) go(`/provider/subscriber/${id}`, { error: "That email is already used for a login." });

  const db = getDb();
  db.exec("BEGIN");
  try {
    run("UPDATE users SET name = ?, email = ? WHERE id = ?", input.name, input.email, current.user_id);
    run(
      `UPDATE customers
       SET mobile = ?, address = ?, city = ?, pincode = ?, state = ?, country = ?, status = ?, plan_id = ?, renew_date = ?, installation_date = ?, notes = ?, area = ?, bill_cycle = ?, reminders = ?, account_category = ?, disconnect_unpaid = ?, plan_amount = ?, plan_label = ?, line_name = ?
       WHERE id = ?`,
      input.mobile,
      input.address,
      input.city,
      input.pincode,
      input.state,
      input.country,
      input.status,
      input.planId,
      renewDate,
      input.installationDate,
      input.notes,
      allows(session.productPlan, "areas") ? input.area : current.area,
      input.billCycle,
      input.reminders,
      input.accountCategory,
      input.disconnectUnpaid,
      input.planId === current.plan_id ? current.plan_amount : 0,
      input.planId === current.plan_id ? current.plan_label : "",
      input.lineName,
      id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const changed = input.status !== current.status || input.lineName !== current.line_name;
  const line = changed ? await syncNetworkLine(session.providerId, input.lineName, input.status === "active") : { state: "idle" as const, detail: "" };
  const previous =
    changed && input.lineName !== current.line_name && current.line_name && line.state !== "idle"
      ? " The previous username was left as it was."
      : "";
  refresh();
  go(`/provider/subscriber/${id}`, {
    notice: line.detail ? `Subscriber details saved. ${line.detail}${previous}` : "Subscriber details saved.",
  });
}

async function mailResetLink(input: {
  userId: number;
  kind: "desk" | "operator";
  email: string;
  ispName?: string;
  signoff: string;
  fromProvider?: boolean;
}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  run("DELETE FROM password_resets WHERE user_id = ? AND account_kind = ?", input.userId, input.kind);
  run(
    "INSERT INTO password_resets (user_id, token_hash, expires_at, account_kind) VALUES (?, ?, ?, ?)",
    input.userId,
    tokenHash,
    String(Date.now() + 15 * 60 * 1000),
    input.kind,
  );
  const mail = passwordResetMail({
    ispName: input.ispName,
    signoff: input.signoff,
    link: `${siteOrigin()}/forgot/${token}`,
    fromProvider: input.fromProvider,
  });
  const sent = await sendMail(input.email, mail.subject, mail.text, mail.html);
  if (!sent.ok) run("DELETE FROM password_resets WHERE token_hash = ?", tokenHash);
  return sent;
}

export async function resetPortalPassword(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  const via = readText(formData, "via");
  if (!isPasswordVia(via)) go(`/provider/subscriber/${id}`, { error: "Choose email, WhatsApp, or message." });
  if (via !== "email") {
    const error =
      via === "whatsapp"
        ? "WhatsApp is not connected yet, so no reset link was sent."
        : "Message is not connected yet, so no reset link was sent.";
    go(`/provider/subscriber/${id}`, { error });
  }
  const sent = await mailResetLink({
    userId: current.user_id,
    kind: "desk",
    email: current.email,
    ispName: session.brandName,
    signoff: session.brandName,
    fromProvider: true,
  });
  if (!sent.ok) {
    const error =
      sent.reason === "unconfigured"
        ? "Email is not connected yet, so no reset link was sent."
        : "The email could not be sent, so no reset link was sent.";
    go(`/provider/subscriber/${id}`, { error });
  }
  run("UPDATE customers SET password_via = ? WHERE id = ?", via, current.id);
  refresh();
  go(`/provider/subscriber/${id}`, { notice: `A link to set a new password was sent to ${current.email}.` });
}

export async function requestPasswordReset(formData: FormData) {
  const email = readText(formData, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) go("/forgot", { error: "Enter the email you use to sign in." });
  const user = one<{ id: number; role: "admin" | "customer"; isp_name: string | null }>(
    `SELECT u.id, u.role, p.name AS isp_name
     FROM users u
     LEFT JOIN providers p ON p.id = u.provider_id
     WHERE lower(u.email) = ?`,
    email,
  );
  const operator = user ? undefined : one<{ id: number }>("SELECT id FROM platform_admins WHERE lower(email) = ?", email);
  if (!user && !operator) go("/forgot", { error: "This email is not on an account." });
  if (!mailConfigured()) go("/forgot", { error: "Password email is not connected yet. Add the mail account, then try again." });
  const sent = user
    ? await mailResetLink({
        userId: user.id,
        kind: "desk",
        email,
        ispName: user.isp_name || undefined,
        signoff: user.role === "customer" ? user.isp_name || "Zignal Connect" : "Zignal Connect",
      })
    : operator
      ? await mailResetLink({ userId: operator.id, kind: "operator", email, signoff: "Zignal Connect" })
      : null;
  if (!sent) go("/forgot", { error: "This email is not on an account." });
  if (!sent.ok) go("/forgot", { error: "The reset email could not be sent. Try again in a little while." });
  go("/forgot", { sent: "1" });
}

export async function completePasswordReset(formData: FormData) {
  const token = readText(formData, "token");
  const nextPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const back = `/forgot/${encodeURIComponent(token)}`;
  if (nextPassword.length < 6) go(back, { error: "Use at least 6 characters for the new password." });
  if (nextPassword !== confirm) go(back, { error: "The new password and confirmation do not match." });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = one<{ id: number; user_id: number; expires_at: string; account_kind: string; role: "admin" | "customer" | null }>(
    `SELECT r.id, r.user_id, r.expires_at, r.account_kind, u.role
     FROM password_resets r
     LEFT JOIN users u ON u.id = r.user_id AND r.account_kind = 'desk'
     WHERE r.token_hash = ?`,
    tokenHash,
  );
  if (!row || Number(row.expires_at) < Date.now()) {
    if (row) run("DELETE FROM password_resets WHERE id = ?", row.id);
    go("/forgot", { error: "That reset link has expired. Start again." });
  }
  if (row.account_kind === "operator") {
    run("UPDATE platform_admins SET password_hash = ? WHERE id = ?", hashPassword(nextPassword), row.user_id);
    run("DELETE FROM password_resets WHERE user_id = ? AND account_kind = 'operator'", row.user_id);
    refresh();
    await setSession(row.user_id, "operator");
    redirect("/zignal");
  }
  run("UPDATE users SET password_hash = ?, login_password = '' WHERE id = ?", hashPassword(nextPassword), row.user_id);
  run("DELETE FROM password_resets WHERE user_id = ? AND account_kind = 'desk'", row.user_id);
  refresh();
  await setSession(row.user_id, "desk");
  redirect(row.role === "admin" ? "/provider" : "/subscriber");
}

export async function savePromise(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  const date = readText(formData, "promise_on");
  const today = todayISO();
  const window = promiseWindow(current.renew_date, today);
  if (!isDate(date) || date < window.earliest || date > window.latest) {
    go(`/provider/subscriber/${id}`, { tab: "invoice", error: "Pick a promise date within 14 days after the renewal date." });
  }
  const due = invoiceFor(current, listCustomerCharges(id), {
    discounts: listCustomerDiscounts(id),
    extraPlans: listCustomerExtraPlans(id),
  }).due;
  if (!promiseAllowed(current, due)) {
    go(`/provider/subscriber/${id}`, { tab: "invoice", error: "A promise is for an active line that is due, or a line that is already disconnected." });
  }
  const wasDown = current.promise_on ? current.promise_was_down : current.status === "disconnected" ? 1 : 0;
  run("UPDATE customers SET promise_on = ?, promise_was_down = ?, status = 'active' WHERE id = ?", date, wasDown, id);
  let detail = "";
  if (current.status === "disconnected") {
    const line = await syncNetworkLine(session.providerId, current.line_name, true, { quietIfIdle: true });
    detail = line.detail ? ` ${line.detail}` : "";
  }
  refresh();
  go(`/provider/subscriber/${id}`, {
    tab: "invoice",
    notice: `Promise saved. Pay by ${formatDate(date)}. The renewal date stays ${formatDate(current.renew_date)}.${detail}`,
  });
}

export async function cancelPromise(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  if (!current.promise_on) go(`/provider/subscriber/${id}`, { tab: "invoice", error: "There is no promise on this account." });
  const today = todayISO();
  const putBack = current.promise_was_down === 1 || (current.disconnect_unpaid === 1 && isDate(current.renew_date) && current.renew_date < today);
  run(
    `UPDATE customers SET promise_on = '', promise_was_down = 0${putBack ? ", status = 'disconnected'" : ""} WHERE id = ?`,
    id,
  );
  let detail = "";
  if (putBack && current.status !== "disconnected") {
    const line = await syncNetworkLine(session.providerId, current.line_name, false, { quietIfIdle: true });
    detail = line.detail ? ` ${line.detail}` : "";
  }
  refresh();
  go(`/provider/subscriber/${id}`, { tab: "invoice", notice: `Promise removed.${detail}` });
}

export async function recordPayment(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });

  const amount = Number(formData.get("amount"));
  const method = readText(formData, "method");
  const note = readText(formData, "note");
  const methods = ["UPI", "Card", "Net banking", "Cash", "Internet"];
  if (!Number.isInteger(amount) || amount <= 0) {
    go(`/provider/subscriber/${id}`, { tab: "billing", error: "Enter a payment amount in whole rupees." });
  }
  if (!methods.includes(method)) go(`/provider/subscriber/${id}`, { tab: "billing", error: "Choose a payment method." });
  if (note.length > 200) go(`/provider/subscriber/${id}`, { tab: "billing", error: "Keep the payment note short." });

  const charges = listCustomerCharges(id);
  const discounts = listCustomerDiscounts(id);
  const extraPlans = listCustomerExtraPlans(id);
  const today = todayISO();
  const periodStart = current.renew_date > today ? today : current.renew_date;
  const built = invoiceFor(current, charges, {
    discounts,
    extraPlans,
  });
  const due = built.due;
  const kind = amount >= due ? "full" : "partial";
  const periodEnd = kind === "full" ? renewalAfterPayment(current.renew_date, current.promise_on, today, current.bill_cycle) : current.renew_date;
  const reference = makeRef();
  const lineItems =
    kind === "full"
      ? JSON.stringify(
          invoiceFor(current, charges, {
            paid: amount,
            discounts,
            extraPlans,
          }).lines,
        )
      : "";

  const db = getDb();
  let paymentId = 0;
  db.exec("BEGIN");
  try {
    const inserted = run(
      `INSERT INTO payments
        (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind, line_items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      amount,
      method,
      reference,
      nowStamp(),
      periodStart,
      periodEnd,
      note || `Recorded by ${session.name}`,
      kind,
      lineItems,
    );
    paymentId = Number(inserted.lastInsertRowid);
    if (kind === "full") {
      run("UPDATE customers SET renew_date = ?, status = 'active', promise_on = '', promise_was_down = 0 WHERE id = ?", periodEnd, id);
      run("UPDATE customer_charges SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", id);
      run("UPDATE customer_discounts SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", id);
      if (current.plan_frequency === "once") run("UPDATE customers SET plan_billed = 1 WHERE id = ?", id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (kind === "full" && current.status !== "active") {
    const line = await syncNetworkLine(session.providerId, current.line_name, true, { quietIfIdle: true });
    if (line.state === "error" || line.state === "warn") {
      refresh();
      go(`/provider/subscriber/${id}`, { tab: "billing", notice: `Payment recorded. ${line.detail}` });
    }
  }

  refresh();
  go(`/provider/receipt/income/${paymentId}`);
}

function billingGo(id: number, params?: Record<string, string>): never {
  go(`/provider/subscriber/${id}`, { tab: "plans", ...params });
}

function billingCustomer(providerId: number, formData: FormData) {
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  return current;
}

function billingTax(formData: FormData) {
  return readBillTax(String(formData.get("tax") ?? "included"), String(formData.get("tax_percent") ?? ""));
}

function billingTiming(value: string) {
  if (value === "once") return { frequency: "once" as const, billCycle: "" };
  if (isBillCycle(value)) return { frequency: "recurring" as const, billCycle: value };
  return null;
}

function readServiceDates(formData: FormData, mode: "both" | "activation", cycle?: string) {
  const activated = readText(formData, "activated_on");
  if (!isDate(activated)) return { ok: false as const, error: "Enter the activation date." };
  const renews = mode === "both" && cycle && isBillCycle(cycle) ? renewalAfterInstallation(activated, cycle) : "";
  return { ok: true as const, activated, renews };
}

export async function saveSubscriberPlan(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const token = String(formData.get("plan_id") ?? "");
  const customName = readText(formData, "plan_custom_name");
  const cycle = readText(formData, "frequency");
  const amount = Number(formData.get("amount"));
  const tax = billingTax(formData);
  if (!isBillCycle(cycle)) billingGo(current.id, { line: "plan", error: "Choose how often this internet plan is billed." });
  const dates = readServiceDates(formData, "both", cycle);
  if (!Number.isInteger(amount) || amount <= 0) billingGo(current.id, { line: "plan", error: "Enter the plan amount in whole rupees." });
  if (!tax.ok) billingGo(current.id, { line: "plan", error: "Tax is a percent such as 18, or included." });
  if (!dates.ok) billingGo(current.id, { line: "plan", error: dates.error });
  let planId = current.plan_id;
  let planLabel = "";
  if (token === "__custom__") {
    if (customName.length < 2 || customName.length > 40) billingGo(current.id, { line: "plan", error: "Name the custom internet plan in a few words." });
    planLabel = customName;
    if (!current.plan_label) planId = insertCustomPlan(session.providerId, amount);
  } else {
    planId = Number(token);
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ? AND listed = 1", planId, session.providerId)) {
      billingGo(current.id, { line: "plan", error: "Choose an internet plan from the catalogue." });
    }
  }
  run(
    "UPDATE customers SET plan_id = ?, plan_label = ?, plan_amount = ?, plan_cycle = ?, plan_tax_included = ?, plan_tax_percent = ?, installation_date = ?, renew_date = ? WHERE id = ?",
    planId,
    planLabel,
    amount,
    cycle,
    tax.taxIncluded ? 1 : 0,
    tax.taxPercent,
    dates.activated,
    dates.renews,
    current.id,
  );
  refresh();
  billingGo(current.id, { notice: "Internet plan updated." });
}

export async function saveExtraPlan(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const extraId = Number(formData.get("extra_id") || 0);
  const token = String(formData.get("plan_id") ?? "");
  const customName = readText(formData, "plan_custom_name");
  const cycle = readText(formData, "frequency");
  const amount = Number(formData.get("amount"));
  const tax = billingTax(formData);
  const back = extraId ? `extra-${extraId}` : "add-plan";
  if (!isBillCycle(cycle)) billingGo(current.id, { line: back, error: "Choose how often this internet plan is billed." });
  const dates = readServiceDates(formData, "both", cycle);
  if (extraId && !one("SELECT id FROM customer_extra_plans WHERE id = ? AND customer_id = ?", extraId, current.id)) {
    billingGo(current.id, { error: "That internet plan was not found on this account." });
  }
  if (!Number.isInteger(amount) || amount <= 0) billingGo(current.id, { line: back, error: "Enter the plan amount in whole rupees." });
  if (!tax.ok) billingGo(current.id, { line: back, error: "Tax is a percent such as 18, or included." });
  if (!dates.ok) billingGo(current.id, { line: back, error: dates.error });
  let planId = 0;
  let label = "";
  if (token === "__custom__") {
    if (customName.length < 2 || customName.length > 40) billingGo(current.id, { line: back, error: "Name the custom internet plan in a few words." });
    label = customName;
    const existing = extraId
      ? one<{ plan_id: number; label: string }>("SELECT plan_id, label FROM customer_extra_plans WHERE id = ?", extraId)
      : null;
    planId = existing?.label ? existing.plan_id : insertCustomPlan(session.providerId, amount);
  } else {
    planId = Number(token);
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ? AND listed = 1", planId, session.providerId)) {
      billingGo(current.id, { line: back, error: "Choose an internet plan from the catalogue." });
    }
  }
  if (extraId) {
    run(
      "UPDATE customer_extra_plans SET plan_id = ?, label = ?, bill_cycle = ?, amount = ?, tax_included = ?, tax_percent = ?, activated_on = ?, renews_on = ? WHERE id = ? AND customer_id = ?",
      planId,
      label,
      cycle,
      amount,
      tax.taxIncluded ? 1 : 0,
      tax.taxPercent,
      dates.activated,
      dates.renews,
      extraId,
      current.id,
    );
  } else {
    run(
      "INSERT INTO customer_extra_plans (customer_id, plan_id, bill_cycle, amount, tax_included, tax_percent, label, activated_on, renews_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      current.id,
      planId,
      cycle,
      amount,
      tax.taxIncluded ? 1 : 0,
      tax.taxPercent,
      label,
      dates.activated,
      dates.renews,
    );
  }
  refresh();
  billingGo(current.id, { notice: extraId ? "Internet plan updated." : "Internet plan added." });
}

export async function disconnectExtraPlan(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const extraId = Number(formData.get("extra_id"));
  const back = `disconnect-${extraId}`;
  const plan = one<{
    label: string;
    plan_name: string;
    price: number;
    bill_cycle: string;
    amount: number;
    tax_included: number;
    tax_percent: number;
    activated_on: string;
    renews_on: string;
  }>(
    `SELECT e.label, CASE WHEN e.label <> '' THEN e.label ELSE p.name END AS plan_name, p.price, e.bill_cycle, e.amount, e.tax_included, e.tax_percent, e.activated_on, e.renews_on
     FROM customer_extra_plans e JOIN plans p ON p.id = e.plan_id
     WHERE e.id = ? AND e.customer_id = ?`,
    extraId,
    current.id,
  );
  if (!plan) billingGo(current.id, { error: "That internet plan was not found on this account." });
  const activated = isDate(plan.activated_on) ? plan.activated_on : current.installation_date;
  const renews = isDate(plan.renews_on) ? plan.renews_on : current.renew_date;
  const amount = plan.amount > 0 ? plan.amount : cycleAmount(plan.price, plan.bill_cycle);
  const quote = incompleteCycleCharge(activated, renews, todayISO(), amount);
  const settlement = readText(formData, "settlement");
  if (quote.incomplete && settlement !== "full" && settlement !== "none" && settlement !== "prorate") {
    billingGo(current.id, { line: back, error: "Choose how to charge the incomplete cycle." });
  }
  const charge = quote.incomplete
    ? settlement === "full"
      ? quote.full
      : settlement === "prorate"
        ? quote.prorate
        : 0
    : todayISO() >= renews
      ? quote.full
      : 0;
  const name = (plan.plan_name || "Internet plan").slice(0, 28);
  const label = (quote.incomplete && settlement === "prorate" ? `${name} prorated` : `${name} full cycle`).slice(0, 40);
  const db = getDb();
  db.exec("BEGIN");
  try {
    if (charge > 0) {
      run(
        "INSERT INTO customer_charges (customer_id, kind, label, frequency, bill_cycle, amount, tax_included, tax_percent, activated_on) VALUES (?, 'service', ?, 'once', '', ?, ?, ?, ?)",
        current.id,
        label,
        charge,
        plan.tax_included,
        plan.tax_percent,
        quote.incomplete && settlement === "prorate" ? todayISO() : activated,
      );
    }
    run("DELETE FROM customer_extra_plans WHERE id = ? AND customer_id = ?", extraId, current.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  refresh();
  const notice = !quote.incomplete
    ? charge > 0
      ? "Plan disconnected. The finished cycle stays on the open invoice."
      : "Plan disconnected."
    : settlement === "full"
      ? "Plan disconnected. The full cycle stays on the open invoice."
      : settlement === "prorate"
        ? "Plan disconnected. A prorated charge is on the open invoice."
        : "Plan disconnected. This cycle was not charged.";
  billingGo(current.id, { notice });
}

export async function saveCustomerCharge(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const chargeId = Number(formData.get("charge_id") || 0);
  const catalogueId = Number(formData.get("catalogue_charge") || 0);
  const timing = billingTiming(readText(formData, "frequency"));
  const amount = Number(formData.get("amount"));
  const tax = billingTax(formData);
  const dates = readServiceDates(formData, "activation");
  const back = chargeId ? `charge-${chargeId}` : "add-charge";
  if (chargeId && !one("SELECT id FROM customer_charges WHERE id = ? AND customer_id = ?", chargeId, current.id)) {
    billingGo(current.id, { error: "That charge was not found on this account." });
  }
  if (!timing) billingGo(current.id, { line: back, error: "Choose one-time, or a bill cycle, for this charge." });
  if (!Number.isInteger(amount) || amount <= 0) billingGo(current.id, { line: back, error: "Enter the charge in whole rupees." });
  if (!tax.ok) billingGo(current.id, { line: back, error: "Tax is a percent such as 18, or included." });
  if (!dates.ok) billingGo(current.id, { line: back, error: dates.error });
  const catalogue = catalogueId
    ? one<{ name: string; kind: string }>("SELECT name, kind FROM charge_catalogue WHERE id = ? AND provider_id = ?", catalogueId, session.providerId)
    : null;
  if (catalogueId && !catalogue) billingGo(current.id, { line: back, error: "That charge is no longer on the catalogue." });
  const label = readText(formData, "label") || catalogue?.name || "";
  const kind = catalogue?.kind || "other";
  if (label.length < 2 || label.length > 40) billingGo(current.id, { line: back, error: "Name the charge in a few words." });
  if (!["router", "installation", "service", "other"].includes(kind)) billingGo(current.id, { line: back, error: "Choose a charge from the catalogue, or type a name." });
  if (chargeId) {
    run(
      "UPDATE customer_charges SET kind = ?, label = ?, frequency = ?, bill_cycle = ?, amount = ?, tax_included = ?, tax_percent = ?, activated_on = ? WHERE id = ? AND customer_id = ?",
      kind,
      label,
      timing.frequency,
      timing.billCycle,
      amount,
      tax.taxIncluded ? 1 : 0,
      tax.taxPercent,
      dates.activated,
      chargeId,
      current.id,
    );
  } else {
    run(
      "INSERT INTO customer_charges (customer_id, kind, label, frequency, bill_cycle, amount, tax_included, tax_percent, activated_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      current.id,
      kind,
      label,
      timing.frequency,
      timing.billCycle,
      amount,
      tax.taxIncluded ? 1 : 0,
      tax.taxPercent,
      dates.activated,
    );
  }
  refresh();
  billingGo(current.id, { notice: chargeId ? "Charge updated." : "Charge added." });
}

export async function deleteCustomerCharge(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  run("DELETE FROM customer_charges WHERE id = ? AND customer_id = ?", Number(formData.get("charge_id")), current.id);
  refresh();
  billingGo(current.id, { notice: "Charge removed." });
}

export async function saveCustomerDiscount(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const discountId = Number(formData.get("discount_id") || 0);
  const catalogueId = Number(formData.get("catalogue_discount") || 0);
  const applies = readText(formData, "applies_to");
  const frequency = readText(formData, "frequency");
  const mode = readText(formData, "mode");
  const value = Number(formData.get("value"));
  const back = discountId ? `discount-${discountId}` : "add-discount";
  if (discountId && !one("SELECT id FROM customer_discounts WHERE id = ? AND customer_id = ?", discountId, current.id)) {
    billingGo(current.id, { error: "That discount was not found on this account." });
  }
  const catalogue = catalogueId
    ? one<{ name: string }>("SELECT name FROM discount_catalogue WHERE id = ? AND provider_id = ?", catalogueId, session.providerId)
    : null;
  if (catalogueId && !catalogue) billingGo(current.id, { line: back, error: "That promo is no longer on the catalogue." });
  const name = readText(formData, "name") || catalogue?.name || "";
  const planId = applies.startsWith("plan:") ? Number(applies.slice(5)) : 0;
  const fixed = ["router", "installation", "service", "invoice"].includes(applies);
  if (planId) {
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", planId, session.providerId)) {
      billingGo(current.id, { line: back, error: "Choose what the discount applies to." });
    }
  } else if (!fixed) billingGo(current.id, { line: back, error: "Choose what the discount applies to." });
  const oneTime = applies === "router" || applies === "installation" || applies === "service";
  const timing = oneTime ? "once" : frequency;
  if (timing !== "once" && timing !== "recurring") billingGo(current.id, { line: back, error: "Choose one time, or always with the internet plan." });
  if (mode !== "amount" && mode !== "percent") billingGo(current.id, { line: back, error: "Choose an amount or a percent." });
  if (!Number.isInteger(value) || value <= 0 || (mode === "percent" && value > 100)) {
    billingGo(current.id, { line: back, error: "Enter a whole number of rupees, or a percent up to 100." });
  }
  if (name.length < 2 || name.length > 40) billingGo(current.id, { line: back, error: "Name the discount in a few words." });
  if (discountId) {
    run(
      "UPDATE customer_discounts SET name = ?, applies_to = ?, mode = ?, frequency = ?, value = ? WHERE id = ? AND customer_id = ?",
      name,
      applies,
      mode,
      timing,
      value,
      discountId,
      current.id,
    );
  } else {
    run(
      "INSERT INTO customer_discounts (customer_id, name, applies_to, mode, frequency, value) VALUES (?, ?, ?, ?, ?, ?)",
      current.id,
      name,
      applies,
      mode,
      timing,
      value,
    );
  }
  refresh();
  billingGo(current.id, { notice: discountId ? "Discount updated." : "Discount added." });
}

export async function deleteCustomerDiscount(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  run("DELETE FROM customer_discounts WHERE id = ? AND customer_id = ?", Number(formData.get("discount_id")), current.id);
  refresh();
  billingGo(current.id, { notice: "Discount removed." });
}

export async function updatePaymentDetails(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const paymentId = Number(formData.get("payment_id"));
  const amount = Number(formData.get("amount"));
  const method = readText(formData, "method");
  const note = readText(formData, "note");
  const methods = ["UPI", "Card", "Net banking", "Cash", "Internet"];
  const back = `payment-${paymentId}`;
  if (!one("SELECT id FROM payments WHERE id = ? AND customer_id = ?", paymentId, current.id)) {
    billingGo(current.id, { tab: "payment", error: "That payment was not found on this account." });
  }
  if (!Number.isInteger(amount) || amount <= 0) billingGo(current.id, { tab: "payment", line: back, error: "Enter the payment in whole rupees." });
  if (!methods.includes(method)) billingGo(current.id, { tab: "payment", line: back, error: "Choose a payment method." });
  if (note.length > 200) billingGo(current.id, { tab: "payment", line: back, error: "Keep the payment note short." });
  run("UPDATE payments SET amount = ?, method = ?, note = ?, receipt_snapshot = '' WHERE id = ? AND customer_id = ?", amount, method, note, paymentId, current.id);
  refresh();
  billingGo(current.id, { tab: "payment", notice: "Payment updated. The renewal date is unchanged." });
}

export async function sendReminder(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  if (!current.reminders) {
    go(`/provider/subscriber/${id}`, { error: "Payment reminders are turned off for this line. Turn them on in the service record to send one." });
  }

  const channel = readText(formData, "channel") || "portal";
  if (channel === "email" && !allows(session.productPlan, "emailReminders")) {
    go(`/provider/subscriber/${id}`, { error: "Email reminders are part of Pro, Ultra, and Premium." });
  }
  if ((channel === "sms" || channel === "whatsapp") && !allows(session.productPlan, "sms")) {
    go(`/provider/subscriber/${id}`, { error: "This desk plan does not include SMS and WhatsApp reminders." });
  }
  if (!["portal", "email", "sms", "whatsapp"].includes(channel)) {
    go(`/provider/subscriber/${id}`, { error: "Choose where the reminder should go." });
  }

  const preset = readText(formData, "preset");
  let title = "";
  let body = "";
  if (preset === "upcoming") {
    title = "Renewal coming up";
    body = `${current.plan_name} renews on ${formatDate(current.renew_date)}. Amount due is ${formatInr(current.price)}.`;
  } else if (preset === "overdue") {
    title = "Payment overdue";
    body = `The renewal dated ${formatDate(current.renew_date)} is still open. Please pay ${formatInr(current.price)} to keep ${current.plan_name} current.`;
  } else {
    title = readText(formData, "title");
    body = readText(formData, "body");
    if (title.length < 3 || body.length < 3) {
      go(`/provider/subscriber/${id}`, { error: "A custom reminder needs a title and a message." });
    }
  }
  if (title.length > 80 || body.length > 400) {
    go(`/provider/subscriber/${id}`, { error: "That reminder is too long." });
  }

  if (channel === "email") {
    if (!mailConfigured()) go(`/provider/subscriber/${id}`, { error: "Email is not connected yet, so the reminder was not sent." });
    const mail = renewalMail({ ispName: session.brandName, signoff: session.brandName, title, body });
    const mailed = await sendMail(current.email, mail.subject, mail.text, mail.html);
    if (!mailed.ok) go(`/provider/subscriber/${id}`, { error: "The reminder email could not be sent." });
  }

  run(
    "INSERT INTO reminders (customer_id, title, body, created_at, channel) VALUES (?, ?, ?, ?, ?)",
    id,
    title,
    body,
    nowStamp(),
    channel === "email" ? "email" : channel,
  );
  refresh();
  const delivery =
    channel === "email"
      ? `Reminder emailed to ${current.email}. A copy is on the subscriber portal.`
      : channel === "portal"
        ? "Reminder is on the subscriber portal."
        : "Message and WhatsApp are not connected yet, so this reminder is only on the subscriber portal.";
  go(`/provider/subscriber/${id}`, { notice: delivery });
}

export async function savePlan(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("plan_id") || 0);
  const name = readText(formData, "name");
  const speed = Number(formData.get("speed_mbps"));
  const price = Number(formData.get("price"));
  const dataCap = readText(formData, "data_cap") || "Unlimited";
  const description = readText(formData, "description");

  if (name.length < 2) go("/provider/plans", { error: "Enter a plan name." });
  if (!Number.isInteger(speed) || speed <= 0) go("/provider/plans", { error: "Enter the speed in Mbps." });
  if (!Number.isInteger(price) || price <= 0) go("/provider/plans", { error: "Enter the monthly price in rupees." });
  if (description.length < 8) go("/provider/plans", { error: "Add a short description of who the plan is for." });

  const clash = one<{ id: number }>(
    "SELECT id FROM plans WHERE provider_id = ? AND name = ? AND id != ?",
    session.providerId,
    name,
    id,
  );
  if (clash) go("/provider/plans", { error: "A plan with that name already exists." });

  if (id) {
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", id, session.providerId)) {
      go("/provider/plans", { error: "That plan was not found." });
    }
    run(
      "UPDATE plans SET name = ?, speed_mbps = ?, price = ?, data_cap = ?, description = ? WHERE id = ? AND provider_id = ?",
      name,
      speed,
      price,
      dataCap,
      description,
      id,
      session.providerId,
    );
  } else {
    run(
      "INSERT INTO plans (provider_id, name, speed_mbps, price, data_cap, description) VALUES (?, ?, ?, ?, ?, ?)",
      session.providerId,
      name,
      speed,
      price,
      dataCap,
      description,
    );
  }

  refresh();
  go("/provider/plans", { notice: id ? "Plan updated." : "Plan added to the catalogue." });
}

export async function payBill(formData: FormData) {
  const session = await requireRole("customer");
  if (!allows(session.productPlan, "onlinePay")) {
    go("/subscriber/pay", { error: "Online renewal is not on this desk plan. Pay the office for now." });
  }
  const current = getSubscriberByUserId(session.uid);
  if (!current) go("/subscriber", { error: "No service line is linked to this login." });

  const promoCode = readText(formData, "promo");
  const instrument = readGatewayPayment(formData);
  if (!instrument.ok) go("/subscriber/pay", { promo: promoCode, error: instrument.error });
  if (instrument.payment.method === "Auto-pay") {
    go("/subscriber/pay", { promo: promoCode, error: "Auto-pay uses a method saved in Settings. Choose a card, UPI, or net banking for this bill." });
  }
  const { payment } = instrument;

  const today = todayISO();
  const periodEnd = renewalAfterPayment(current.renew_date, current.promise_on, today, current.bill_cycle);
  const periodStart = current.renew_date > today ? current.renew_date : today;
  const reference = makeRef();
  const charges = listCustomerCharges(current.id);
  const discounts = listCustomerDiscounts(current.id);
  const extraPlans = listCustomerExtraPlans(current.id);
  const built = invoiceFor(current, charges, {
    discounts,
    extraPlans,
  });
  const due = built.due;
  if (due <= 0) go("/subscriber/pay", { error: "Nothing is due on this line." });
  let promoName = "";
  let off = 0;
  if (promoCode) {
    const promo = findCataloguePromo(session.providerId, promoCode);
    if (!promo || (promo.mode !== "amount" && promo.mode !== "percent")) {
      go("/subscriber/pay", { error: "That promo code is not on this connection." });
    }
    if (discounts.some((discount) => discount.name.toLowerCase() === promo.name.toLowerCase())) {
      go("/subscriber/pay", { error: "That promo is already on this bill." });
    }
    promoName = promo.name;
    off = promoOff(due, promo.mode, promo.value);
  }
  const payable = Math.max(0, due - off);
  const note = [payment.detail ? `Payer reference: ${payment.detail}` : "Paid from the subscriber portal", promoName ? `Promo ${promoName}` : ""]
    .filter(Boolean)
    .join(". ");
  const lineItems = JSON.stringify(
    off > 0 ? [...built.lines, { description: `${promoName} promo`, amount: -off }] : built.lines,
  );

  if (payable > 0) {
    const result = collectSubscriberPayment(current.id, { ...payment, amount: payable });
    if (!result.ok) go("/subscriber/pay", { promo: promoName, notice: "gateway" });
  }

  const db = getDb();
  let paymentId = 0;
  db.exec("BEGIN");
  try {
    const inserted = run(
      `INSERT INTO payments
        (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind, line_items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'full', ?)`,
      current.id,
      payable,
      payable === 0 ? "Promo" : payment.method,
      reference,
      nowStamp(),
      periodStart,
      periodEnd,
      note,
      lineItems,
    );
    paymentId = Number(inserted.lastInsertRowid);
    run("UPDATE customers SET renew_date = ?, status = 'active', promise_on = '', promise_was_down = 0 WHERE id = ?", periodEnd, current.id);
    run("UPDATE customer_charges SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", current.id);
    run("UPDATE customer_discounts SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", current.id);
    if (current.plan_frequency === "once") run("UPDATE customers SET plan_billed = 1 WHERE id = ?", current.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (current.status !== "active") await syncNetworkLine(session.providerId, current.line_name, true, { quietIfIdle: true });
  refresh();
  go(`/subscriber/receipt/${paymentId}`);
}

export async function requestDeskClose(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/settings", { error: "Only the owner of this desk can close it." });
  const quitOn = readText(formData, "quit_on");
  const reason = readText(formData, "reason").replace(/\s+/g, " ");
  const password = String(formData.get("password") ?? "");
  const today = todayISO();
  const latest = latestQuitDate();
  if (!isDate(quitOn) || quitOn < today || quitOn > latest) {
    go("/provider/settings", { error: "Choose a quit date from today through the next year." });
  }
  if (reason.length < 4 || reason.length > 400) {
    go("/provider/settings", { error: "Write a short reason for closing the desk." });
  }
  const user = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", session.uid);
  if (!user || !verifyPassword(password, user.password_hash)) {
    go("/provider/settings", { error: "That password does not match." });
  }
  const current = one<{ quit_on: string; closed_at: string }>("SELECT quit_on, closed_at FROM providers WHERE id = ?", session.providerId);
  if (current?.closed_at) go("/provider/settings", { error: "This desk is already closed." });
  if (current?.quit_on && current.quit_on <= today) {
    go("/provider/settings", { error: "The quit date has arrived. This desk can no longer be changed or re-opened." });
  }
  run("UPDATE providers SET quit_on = ?, quit_reason = ? WHERE id = ?", quitOn, reason, session.providerId);
  const quit = settleDesk(session.providerId);
  if (quit.phase === "closed") {
    refresh();
    await clearSession();
    redirect(`/?error=${encodeURIComponent(`This desk closed on ${formatDate(quit.closedAt)}. Sign-in has stopped.`)}`);
  }
  refresh();
  const count = quit.open.length;
  go("/provider/settings", {
    notice:
      count === 0
        ? `Quit is set for ${formatDate(quitOn)}. Payments due by that day are already closed.`
        : `Quit is set for ${formatDate(quitOn)}. Close ${count} payment${count === 1 ? "" : "s"} before that day. The desk stays open until then.`,
  });
}

export async function reopenDesk(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/settings", { error: "Only the owner of this desk can re-open it." });
  const password = String(formData.get("password") ?? "");
  const user = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", session.uid);
  if (!user || !verifyPassword(password, user.password_hash)) {
    go("/provider/settings", { error: "That password does not match." });
  }
  const today = todayISO();
  const current = one<{ quit_on: string; closed_at: string }>("SELECT quit_on, closed_at FROM providers WHERE id = ?", session.providerId);
  if (current?.closed_at) go("/provider/settings", { error: "This desk is already closed." });
  if (!current?.quit_on) go("/provider/settings", { error: "This desk is not set to close." });
  if (current.quit_on <= today) {
    go("/provider/settings", { error: "The quit date has arrived. This desk can no longer be re-opened." });
  }
  run("UPDATE providers SET quit_on = '', quit_reason = '' WHERE id = ?", session.providerId);
  refresh();
  go("/provider/settings", { notice: "This desk is open again. The close request has been taken back." });
}

export async function changePassword(formData: FormData) {
  const session = await requireRole("customer");
  const currentPassword = String(formData.get("current_password") ?? "");
  const nextPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const user = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", session.uid);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    go("/subscriber", { error: "The current password does not match." });
  }
  if (nextPassword.length < 6) go("/subscriber", { error: "Use at least 6 characters for the new password." });
  if (nextPassword !== confirm) go("/subscriber", { error: "The new password and confirmation do not match." });
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(nextPassword), session.uid);
  refresh();
  go("/subscriber", { notice: "Password updated." });
}

export async function registerProvider(
  _previous: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const isp = readText(formData, "isp_name");
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const phone = readText(formData, "support_phone").replace(/\s+/g, "");
  const logo = readText(formData, "logo_letter").toUpperCase();
  const gstin = cleanGstin(readText(formData, "gstin"));
  const address = readText(formData, "address");
  const city = readText(formData, "city");
  const state = readText(formData, "state");
  const country = readText(formData, "country");
  const pincode = readText(formData, "pincode").replace(/\s+/g, "");
  const plan = readText(formData, "product_plan");
  const term: BillTerm = isBillTerm(readText(formData, "billing_term")) ? (readText(formData, "billing_term") as BillTerm) : "monthly";
  const base = Number(readText(formData, "subscriber_base"));
  if (isp.length < 2) return { error: "Enter your ISP name." };
  if (name.length < 2) return { error: "Enter your name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return { error: "Use at least 8 characters, with a lower letter, an upper letter, a number, and a special character." };
  }
  if (password !== confirm) return { error: "Type the same password in both boxes." };
  if (!/^[A-Z]{2}$/.test(logo)) return { error: "Enter a 2-letter logo." };
  if (address.length < 3) return { error: "Enter the office address." };
  if (address.length > 160) return { error: "Keep the office address shorter." };
  if (!/^\d{6}$/.test(pincode)) return { error: "Enter a 6-digit PIN code." };
  if (city.length < 2) return { error: "Enter the city." };
  if (!state || !isIndianState(state)) return { error: "Choose a state." };
  if (country.length < 2 || country.length > 40) return { error: "Enter the country." };
  if (phone && !/^[6-9]\d{9}$/.test(phone)) return { error: "Enter a 10-digit support number, or leave it blank." };
  if (!Number.isSafeInteger(base) || base < 1) {
    return { error: "Enter how many subscribers you have, as a whole number." };
  }
  if (!isProductPlan(plan)) return { error: "Choose Pro, Ultra, or Premium." };
  if (base > CATALOG.ultra.customers && planFamily(plan) !== "premium") {
    return { error: "A book above 1,000 subscribers is on Premium." };
  }
  if (base > CATALOG.premium_30000.customers) {
    if (plan !== "premium_30000") return { error: "A book above 1,000 subscribers is on Premium." };
  } else if (!planFitsBase(plan, base)) {
    const fit = CATALOG[minimumPlan(base)];
    return {
      error: `${CATALOG[plan].label} holds ${limitLabel(CATALOG[plan].customers)} subscribers. A book of ${base} needs ${fit.label}.`,
    };
  }
  if (one("SELECT id FROM users WHERE email = ?", email)) return { error: "That email is already used for a login." };

  const trialEnds = addDays(todayISO(), CATALOG[plan].trialDays);
  const db = getDb();
  let userId = 0;
  let providerId = 0;
  db.exec("BEGIN");
  try {
    const provider = run(
      `INSERT INTO providers
        (name, product_plan, support_phone, logo_letter, created_at, subscriber_base, trial_ends, gstin, address, city, state, country, pincode, billing_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      isp,
      plan,
      phone,
      logo,
      nowStamp(),
      base,
      trialEnds,
      gstin,
      address,
      city,
      state,
      country,
      pincode,
      term,
    );
    providerId = Number(provider.lastInsertRowid);
    const user = run(
      "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'admin', ?, ?, ?, 1)",
      email,
      hashPassword(password),
      name,
      nowStamp(),
      providerId,
    );
    userId = Number(user.lastInsertRowid);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  await setSession(userId);
  const chosen = CATALOG[plan];
  const termLabel = BILL_TERMS.find((item) => item.id === term)?.label ?? "Monthly";
  const fee = formatInr(termQuote(chosen.price, term).due);
  const welcomeTitle = "Welcome to Zignal Connect";
  const welcomeBody = `Your desk for ${isp} is open on ${chosen.label} ${termLabel.toLowerCase()}. The trial runs until ${formatDate(trialEnds)}. The first desk fee of ${fee} is booked for that day. No card is charged during the trial. Sign in with ${email} and the password you chose.`;
  try {
    postDeskWelcome(providerId, welcomeTitle, welcomeBody);
  } catch (error) {
    console.error("desk welcome note", error instanceof Error ? error.message : "failed");
  }
  const welcome = deskWelcomeMail({
    ispName: isp,
    ownerName: name,
    email,
    plan: `${chosen.label} · ${termLabel}`,
    trialEnds: formatDate(trialEnds),
    fee,
  });
  const mailed = await sendMail(email, welcome.subject, welcome.text, welcome.html);
  const welcomeNote = mailed.ok
    ? ` A welcome email was sent to ${email}.`
    : mailed.reason === "unconfigured"
      ? " Welcome email was not sent. The mail account is not connected on the server."
      : " The welcome email could not be sent.";
  redirect(
    `/provider/upgrade?notice=${encodeURIComponent(
      `${chosen.label} ${termLabel.toLowerCase()} trial runs until ${formatDate(trialEnds)}. You registered ${base} subscribers and can add up to ${limitLabel(chosen.customers)} during the trial.${welcomeNote}`,
    )}`,
  );
}

function sheetEmail(row: SheetRow) {
  return (row.cells.email ?? "").trim().toLowerCase();
}

function rowsFor(rows: SheetRow[], email: string) {
  return rows.filter((row) => sheetEmail(row) === email);
}

function dated(value: string) {
  if (blankChargeAmount(value)) return "";
  return normalizeDate(value) ?? "invalid";
}

export async function importCustomers(formData: FormData) {
  const session = await requireRole("admin");
  const upload = formData.get("workbook");
  if (!(upload instanceof File) || upload.size === 0) go("/provider/import", { error: "Choose the customer workbook." });
  if (upload.name.toLowerCase().endsWith(".csv") || upload.type.includes("csv")) {
    go("/provider/import", { error: "Customer import is an Excel file with Account, Internet plan, One-time charge, and Discount tabs. Download the template." });
  }
  const parsed = await readCustomerWorkbook(Buffer.from(await upload.arrayBuffer()));
  if (!parsed.ok) go("/provider/import", { error: parsed.error });
  if (parsed.accounts.length + parsed.plans.length + parsed.charges.length + parsed.discounts.length === 0) {
    go("/provider/import", { error: "There are no rows to import." });
  }

  const usage = getUsage(session.providerId);
  const paused = trialBlock(usage);
  if (paused) go("/provider/import", { error: paused });
  const plans = many<{ id: number; name: string; price: number }>(
    "SELECT id, name, price FROM plans WHERE provider_id = ? AND listed = 1",
    session.providerId,
  );
  const planByName = new Map(plans.map((plan) => [plan.name.toLowerCase(), plan]));
  const chargeByName = new Map(
    many<{ name: string; kind: string; amount: number; tax_included: number; tax_percent: number }>(
      "SELECT name, kind, amount, tax_included, tax_percent FROM charge_catalogue WHERE provider_id = ?",
      session.providerId,
    ).map((charge) => [charge.name.toLowerCase(), charge]),
  );
  const discountByName = new Map(
    many<{ name: string; applies_to: string; frequency: string; mode: string; value: number }>(
      "SELECT name, applies_to, frequency, mode, value FROM discount_catalogue WHERE provider_id = ?",
      session.providerId,
    ).map((discount) => [discount.name.toLowerCase(), discount]),
  );
  const accountEmails = new Set(parsed.accounts.map((row) => sheetEmail(row)).filter(Boolean));
  const seen = new Set<string>();
  let slots = usage.overflowSlots;
  const issues: { line: number; message: string }[] = [];
  let imported = 0;
  let updated = 0;
  const today = todayISO();
  const welcomes: { email: string; password: string }[] = [];
  const db = getDb();
  let batchId = 0;

  type DeskCustomer = {
    customerId: number;
    planId: number;
    planCycle: string;
    billCycle: string;
    installation: string;
    renewal: string;
  };

  function findOnDesk(email: string): DeskCustomer | "other" | null {
    const row = one<{
      provider_id: number;
      role: string;
      customer_id: number | null;
      plan_id: number | null;
      plan_cycle: string | null;
      bill_cycle: string | null;
      installation_date: string | null;
      renew_date: string | null;
    }>(
      `SELECT u.provider_id, u.role, c.id AS customer_id, c.plan_id, c.plan_cycle, c.bill_cycle, c.installation_date, c.renew_date
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
       WHERE lower(u.email) = ?`,
      email,
    );
    if (!row) return null;
    if (row.provider_id !== session.providerId || row.role !== "customer" || !row.customer_id || !row.plan_id) return "other";
    return {
      customerId: row.customer_id,
      planId: row.plan_id,
      planCycle: row.plan_cycle || row.bill_cycle || "monthly",
      billCycle: row.bill_cycle || "monthly",
      installation: row.installation_date || today,
      renewal: row.renew_date || "",
    };
  }

  db.exec("BEGIN");
  try {
    const loose = [
      ["Internet plan", parsed.plans],
      ["One-time charge", parsed.charges],
      ["Discount", parsed.discounts],
    ] as const;
    for (const [label, rows] of loose) {
      for (const row of rows) {
        const email = sheetEmail(row);
        if (!email) {
          issues.push({ line: row.line, message: `${label}, row ${row.line}: Add the account email.` });
          continue;
        }
        if (!accountEmails.has(email)) {
          const found = findOnDesk(email);
          if (found && found !== "other") continue;
          issues.push({
            line: row.line,
            message: found === "other"
              ? `${label}, row ${row.line}: That email is already used.`
              : `${label}, row ${row.line}: ${email} is not on this desk. Add an Account row to create the subscriber.`,
          });
        }
      }
    }

    const jobs = [...parsed.accounts];
    const queued = new Set(accountEmails);
    for (const rows of [parsed.plans, parsed.charges, parsed.discounts]) {
      for (const child of rows) {
        const childEmail = sheetEmail(child);
        if (!childEmail || queued.has(childEmail)) continue;
        const onDesk = findOnDesk(childEmail);
        if (!onDesk || onDesk === "other") continue;
        queued.add(childEmail);
        jobs.push({ line: 0, cells: { email: childEmail } });
      }
    }

    for (const row of jobs) {
      const email = sheetEmail(row);
      const name = (row.cells.name ?? "").trim();
      const mobile = (row.cells.mobile ?? "").replace(/\s+/g, "");
      const address = (row.cells.address ?? "").trim();
      const city = (row.cells.city ?? "").trim();
      const pincode = (row.cells.pincode ?? "").replace(/\s+/g, "");
      const notes = (row.cells.notes ?? "").trim();
      const area = (row.cells.area ?? "").trim();
      const billCycle = billCycleFromImport(row.cells.billCycle ?? "");
      const reminders = remindersFromImport(row.cells.reminders ?? "");
      const accountCategory = accountCategoryFromImport(row.cells.accountCategory ?? "");
      const disconnectUnpaid = remindersFromImport(row.cells.disconnectUnpaid ?? "no");
      const invoiceTax = parseChargeTax(row.cells.invoiceTax ?? "");
      const accountInstalled = dated(row.cells.installation ?? "");
      const accountRenewal = dated(row.cells.renewal ?? "");
      const planRows = rowsFor(parsed.plans, email);
      const chargeRows = rowsFor(parsed.charges, email);
      const discountRows = rowsFor(parsed.discounts, email);
      const found = email ? findOnDesk(email) : null;
      const existing = found && found !== "other" ? found : null;
      const problems: { line: number; message: string }[] = [];
      const fail = (line: number, message: string) => problems.push({ line, message });

      if (seen.has(email)) fail(row.line, `Account, row ${row.line}: That email is already on this file.`);
      else if (found === "other") fail(row.line, `Account, row ${row.line}: That email is already used.`);
      if (!existing && found !== "other" && !seen.has(email)) {
        if (name.length < 2) fail(row.line, `Account, row ${row.line}: Name is missing.`);
        if (!/^\S+@\S+\.\S+$/.test(email)) fail(row.line, `Account, row ${row.line}: Email is not valid.`);
        if (!/^[6-9]\d{9}$/.test(mobile)) fail(row.line, `Account, row ${row.line}: Mobile must be a 10-digit number.`);
        if (address.length < 4 || city.length < 2) fail(row.line, `Account, row ${row.line}: Address and city are required.`);
        if (!/^\d{6}$/.test(pincode)) fail(row.line, `Account, row ${row.line}: PIN code must be 6 digits.`);
        if (billCycle === "invalid") fail(row.line, `Account, row ${row.line}: Bill cycle must be weekly, bi-weekly, monthly, quarterly, bi-annual, or annual.`);
        if (reminders === "invalid") fail(row.line, `Account, row ${row.line}: Send payment reminder must be yes or no.`);
        if (accountCategory === "invalid") fail(row.line, `Account, row ${row.line}: Choose an account category from the list.`);
        if (disconnectUnpaid === "invalid") fail(row.line, `Account, row ${row.line}: Disconnect on non pay must be yes or no.`);
        if (!invoiceTax.ok) fail(row.line, `Account, row ${row.line}: Invoice tax is a percent such as 18, or blank when tax is already included.`);
        if (accountInstalled === "invalid" || accountRenewal === "invalid") fail(row.line, `Account, row ${row.line}: Dates must be YYYY-MM-DD or DD/MM/YYYY.`);
        if (notes.length > 500) fail(row.line, `Account, row ${row.line}: Keep notes under 500 characters.`);
        if (planRows.length === 0) fail(row.line, `Account, row ${row.line}: Add ${email || "this email"} on the Internet plan tab. The plan must already be in the catalogue.`);
      }

      const preparedPlans: { planId: number; cycle: string; amount: number; taxIncluded: boolean; taxPercent: number; activation: string; renewal: string }[] = [];
      for (const planRow of planRows) {
        const planName = (planRow.cells.name ?? "").trim();
        const cataloguePlan = planByName.get(planName.toLowerCase());
        const cycleText = (planRow.cells.frequency ?? "").trim();
        const cycleBase = existing ? existing.billCycle : billCycle === "invalid" ? "monthly" : billCycle;
        const cycle = cycleText ? billCycleFromImport(cycleText) : cycleBase;
        const amountBlank = blankChargeAmount(planRow.cells.amount ?? "");
        const amount = amountBlank ? (cataloguePlan && cycle !== "invalid" ? cycleAmount(cataloguePlan.price, cycle) : 0) : wholeUnits(planRow.cells.amount ?? "");
        const tax = parseChargeTax(planRow.cells.tax ?? "");
        const activation = dated(planRow.cells.activation ?? "");
        const renewal = dated(planRow.cells.renewal ?? "");
        if (!cataloguePlan) fail(planRow.line, `Internet plan, row ${planRow.line}: No catalogue plan named "${planName}". Add it on the Catalogue page first.`);
        else if (cycle === "invalid") fail(planRow.line, `Internet plan, row ${planRow.line}: Frequency must be weekly, bi-weekly, monthly, quarterly, bi-annual, or annual.`);
        else if (!amount) fail(planRow.line, `Internet plan, row ${planRow.line}: Amount is whole rupees. Leave it blank to use the catalogue price.`);
        else if (!tax.ok) fail(planRow.line, `Internet plan, row ${planRow.line}: Tax is a percent such as 18, or blank when tax is already included.`);
        else if (activation === "invalid" || renewal === "invalid") fail(planRow.line, `Internet plan, row ${planRow.line}: Dates must be YYYY-MM-DD or DD/MM/YYYY.`);
        else {
          const start = activation || (accountInstalled !== "invalid" ? accountInstalled : "") || existing?.installation || today;
          const typedRenewal = renewal || (accountRenewal !== "invalid" ? accountRenewal : "");
          preparedPlans.push({
            planId: cataloguePlan.id,
            cycle,
            amount,
            taxIncluded: tax.taxIncluded,
            taxPercent: tax.taxPercent,
            activation: start,
            renewal: typedRenewal || renewalAfterInstallation(start, cycle),
          });
        }
      }

      const preparedCharges: { kind: string; label: string; amount: number; taxIncluded: number; taxPercent: number; activation: string }[] = [];
      for (const chargeRow of chargeRows) {
        const chargeName = (chargeRow.cells.name ?? "").trim();
        const catalogueCharge = chargeByName.get(chargeName.toLowerCase());
        const amountBlank = blankChargeAmount(chargeRow.cells.amount ?? "");
        const amount = amountBlank ? catalogueCharge?.amount ?? 0 : wholeUnits(chargeRow.cells.amount ?? "");
        const taxBlank = blankChargeAmount(chargeRow.cells.tax ?? "");
        const tax = taxBlank ? null : parseChargeTax(chargeRow.cells.tax ?? "");
        const activation = dated(chargeRow.cells.activation ?? "");
        if (!catalogueCharge) fail(chargeRow.line, `One-time charge, row ${chargeRow.line}: No catalogue charge named "${chargeName}". Add it on the Catalogue page first.`);
        else if (!["router", "installation", "service", "other"].includes(catalogueCharge.kind)) fail(chargeRow.line, `One-time charge, row ${chargeRow.line}: That catalogue charge has no type.`);
        else if (!amount) fail(chargeRow.line, `One-time charge, row ${chargeRow.line}: Amount is whole rupees. Leave it blank to use the catalogue amount.`);
        else if (tax && !tax.ok) fail(chargeRow.line, `One-time charge, row ${chargeRow.line}: Tax is a percent such as 18, or blank to use the catalogue tax.`);
        else if (activation === "invalid") fail(chargeRow.line, `One-time charge, row ${chargeRow.line}: Activation date must be YYYY-MM-DD or DD/MM/YYYY.`);
        else preparedCharges.push({
          kind: catalogueCharge.kind,
          label: catalogueCharge.name,
          amount,
          taxIncluded: tax ? (tax.taxIncluded ? 1 : 0) : catalogueCharge.tax_included,
          taxPercent: tax ? tax.taxPercent : catalogueCharge.tax_percent,
          activation: activation || (accountInstalled !== "invalid" ? accountInstalled : "") || existing?.installation || today,
        });
      }

      const preparedDiscounts: { name: string; appliesTo: string; mode: string; frequency: string; value: number }[] = [];
      for (const discountRow of discountRows) {
        const discountName = (discountRow.cells.name ?? "").trim();
        const catalogueDiscount = discountByName.get(discountName.toLowerCase());
        if (!catalogueDiscount) {
          fail(discountRow.line, `Discount, row ${discountRow.line}: No catalogue discount named "${discountName}". Add it on the Catalogue page first.`);
          continue;
        }
        if (catalogueDiscount.applies_to.startsWith("plan:") && !plans.some((plan) => `plan:${plan.id}` === catalogueDiscount.applies_to)) {
          fail(discountRow.line, `Discount, row ${discountRow.line}: ${catalogueDiscount.name} applies to a plan that is no longer on the catalogue.`);
          continue;
        }
        preparedDiscounts.push({
          name: catalogueDiscount.name,
          appliesTo: catalogueDiscount.applies_to,
          mode: catalogueDiscount.mode,
          frequency: catalogueDiscount.frequency === "once" ? "once" : "recurring",
          value: catalogueDiscount.value,
        });
      }

      const main = preparedPlans[0];
      const installationDate = main?.activation || (accountInstalled !== "invalid" ? accountInstalled : "") || today;
      const renewDate = main?.renewal || (accountRenewal !== "invalid" ? accountRenewal : "");
      if (!existing && installationDate && renewDate && renewDate < installationDate) {
        fail(row.line, `Account, row ${row.line}: The renewal date is on or after the activation date.`);
      }
      if (!existing && slots <= 0 && problems.length === 0) {
        fail(row.line, `Account, row ${row.line}: ${usage.catalog.label} includes ${limitLabel(usage.customerCap)} subscribers, with overflow up to ${limitLabel(usage.overflowCap)}. Upgrade to import the rest.`);
      }
      if (problems.length > 0) {
        issues.push(...problems);
        if (email) seen.add(email);
        continue;
      }

      if (existing) {
        const heldPlans = new Set(
          many<{ plan_id: number; bill_cycle: string }>(
            "SELECT plan_id, bill_cycle FROM customer_extra_plans WHERE customer_id = ?",
            existing.customerId,
          ).map((line) => `${line.plan_id}:${line.bill_cycle}`),
        );
        heldPlans.add(`${existing.planId}:${existing.planCycle}`);
        const heldCharges = new Set(
          many<{ label: string }>("SELECT label FROM customer_charges WHERE customer_id = ?", existing.customerId).map((line) => line.label.toLowerCase()),
        );
        const heldDiscounts = new Set(
          many<{ name: string }>("SELECT name FROM customer_discounts WHERE customer_id = ?", existing.customerId).map((line) => line.name.toLowerCase()),
        );
        for (const extra of preparedPlans) {
          const key = `${extra.planId}:${extra.cycle}`;
          if (heldPlans.has(key)) continue;
          run(
            "INSERT INTO customer_extra_plans (customer_id, plan_id, bill_cycle, amount, tax_included, tax_percent, label, activated_on, renews_on) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)",
            existing.customerId,
            extra.planId,
            extra.cycle,
            extra.amount,
            extra.taxIncluded ? 1 : 0,
            extra.taxPercent,
            extra.activation || existing.installation,
            extra.renewal || existing.renewal,
          );
          heldPlans.add(key);
        }
        for (const charge of preparedCharges) {
          if (heldCharges.has(charge.label.toLowerCase())) continue;
          run(
            "INSERT INTO customer_charges (customer_id, kind, label, frequency, bill_cycle, amount, tax_included, tax_percent, activated_on) VALUES (?, ?, ?, 'once', '', ?, ?, ?, ?)",
            existing.customerId,
            charge.kind,
            charge.label,
            charge.amount,
            charge.taxIncluded,
            charge.taxPercent,
            charge.activation,
          );
          heldCharges.add(charge.label.toLowerCase());
        }
        for (const discount of preparedDiscounts) {
          if (heldDiscounts.has(discount.name.toLowerCase())) continue;
          run(
            "INSERT INTO customer_discounts (customer_id, name, applies_to, mode, frequency, value) VALUES (?, ?, ?, ?, ?, ?)",
            existing.customerId,
            discount.name,
            discount.appliesTo,
            discount.mode,
            discount.frequency,
            discount.value,
          );
          heldDiscounts.add(discount.name.toLowerCase());
        }
        seen.add(email);
        updated += 1;
        continue;
      }

      if (!main || !invoiceTax.ok || billCycle === "invalid" || reminders === "invalid" || accountCategory === "invalid" || disconnectUnpaid === "invalid") continue;

      const password = newSubscriberPassword();
      const user = run(
        "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'customer', ?, ?, ?, 0)",
        email,
        hashPassword(password),
        name,
        nowStamp(),
        session.providerId,
      );
      const customer = run(
        `INSERT INTO customers
          (user_id, mobile, address, city, pincode, status, plan_id, renew_date, installation_date, notes, area, bill_cycle, reminders, account_category, disconnect_unpaid,
           plan_frequency, plan_tax_included, plan_tax_percent, invoice_tax_included, invoice_tax_percent, plan_amount, plan_cycle, plan_label)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recurring', ?, ?, ?, ?, ?, ?, '')`,
        Number(user.lastInsertRowid),
        mobile,
        address,
        city,
        pincode,
        main.planId,
        renewDate,
        installationDate,
        notes.slice(0, 500),
        allows(session.productPlan, "areas") ? area.slice(0, 80) : "",
        billCycle,
        reminders ? 1 : 0,
        accountCategory,
        disconnectUnpaid ? 1 : 0,
        main.taxIncluded ? 1 : 0,
        main.taxPercent,
        invoiceTax.taxIncluded ? 1 : 0,
        invoiceTax.taxPercent,
        main.amount,
        main.cycle,
      );
      const placedPlans = new Set([`${main.planId}:${main.cycle}`]);
      for (const extra of preparedPlans.slice(1)) {
        const key = `${extra.planId}:${extra.cycle}`;
        if (placedPlans.has(key)) continue;
        run(
          "INSERT INTO customer_extra_plans (customer_id, plan_id, bill_cycle, amount, tax_included, tax_percent, label, activated_on, renews_on) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)",
          Number(customer.lastInsertRowid),
          extra.planId,
          extra.cycle,
          extra.amount,
          extra.taxIncluded ? 1 : 0,
          extra.taxPercent,
          extra.activation || installationDate,
          extra.renewal || renewDate,
        );
        placedPlans.add(key);
      }
      const placedCharges = new Set<string>();
      for (const charge of preparedCharges) {
        const key = charge.label.toLowerCase();
        if (placedCharges.has(key)) continue;
        run(
          "INSERT INTO customer_charges (customer_id, kind, label, frequency, bill_cycle, amount, tax_included, tax_percent, activated_on) VALUES (?, ?, ?, 'once', '', ?, ?, ?, ?)",
          Number(customer.lastInsertRowid),
          charge.kind,
          charge.label,
          charge.amount,
          charge.taxIncluded,
          charge.taxPercent,
          charge.activation,
        );
        placedCharges.add(key);
      }
      const placedDiscounts = new Set<string>();
      for (const discount of preparedDiscounts) {
        const key = discount.name.toLowerCase();
        if (placedDiscounts.has(key)) continue;
        run(
          "INSERT INTO customer_discounts (customer_id, name, applies_to, mode, frequency, value) VALUES (?, ?, ?, ?, ?, ?)",
          Number(customer.lastInsertRowid),
          discount.name,
          discount.appliesTo,
          discount.mode,
          discount.frequency,
          discount.value,
        );
        placedDiscounts.add(key);
      }
      postOnboardingMessage(Number(customer.lastInsertRowid), session.providerId);
      welcomes.push({ email, password });
      seen.add(email);
      imported += 1;
      slots -= 1;
    }
    const batch = run(
      "INSERT INTO import_batches (provider_id, created_at, imported, updated, skipped, kind) VALUES (?, ?, ?, ?, ?, 'customers')",
      session.providerId,
      nowStamp(),
      imported,
      updated,
      issues.length,
    );
    batchId = Number(batch.lastInsertRowid);
    for (const issue of issues) {
      run("INSERT INTO import_issues (batch_id, line, message) VALUES (?, ?, ?)", batchId, issue.line, issue.message);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  let welcomeFailed = 0;
  for (const welcome of welcomes) {
    const mail = welcomeMail({ ispName: session.brandName, email: welcome.email, password: welcome.password });
    const mailed = await sendMail(welcome.email, mail.subject, mail.text, mail.html);
    if (!mailed.ok) welcomeFailed += 1;
  }
  if (imported > 0) syncDeskOverflow(session.providerId);
  refresh();
  const summary = [`Imported ${imported}`, ...(updated ? [`Updated ${updated}`] : []), `Skipped ${issues.length}`].join(". ");
  const welcomeNote =
    welcomes.length === 0
      ? ""
      : welcomeFailed === 0
        ? " A welcome email with a private password was sent to each new subscriber."
        : ` ${welcomeFailed} welcome email${welcomeFailed === 1 ? "" : "s"} could not be sent. Use Send reset link for those lines.`;
  go("/provider/import", {
    notice: `${summary}.${welcomeNote}`,
    batch: String(batchId),
  });
}

function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function importPayments(formData: FormData) {
  const session = await requireRole("admin");
  const upload = formData.get("workbook");
  if (!(upload instanceof File) || upload.size === 0) go("/provider/payments", { error: "Choose the payment workbook." });
  if (upload.name.toLowerCase().endsWith(".csv") || upload.type.includes("csv")) {
    go("/provider/payments", { error: "Payment import is an Excel file. Download the template." });
  }
  const parsed = await readPaymentWorkbook(Buffer.from(await upload.arrayBuffer()));
  if (!parsed.ok) go("/provider/payments", { error: parsed.error });
  if (parsed.rows.length === 0) go("/provider/payments", { error: "There are no payment rows to import." });

  const issues: { line: number; message: string }[] = [];
  let imported = 0;
  const seenRefs = new Set<string>();
  const seenCash = new Set<string>();
  const turnedOn: number[] = [];
  const db = getDb();
  let batchId = 0;

  db.exec("BEGIN");
  try {
    for (const row of parsed.rows) {
      const email = (row.cells.email ?? "").trim().toLowerCase();
      const mobile = phoneDigits(row.cells.mobile ?? "");
      const name = (row.cells.name ?? "").trim();
      const amount = wholeUnits(row.cells.amount ?? "");
      const paidOn = dated(row.cells.date ?? "");
      const source = paymentSource(row.cells.source ?? "");
      const transactionId = (row.cells.transactionId ?? "").trim();
      const fail = (message: string) => issues.push({ line: row.line, message: `Payments, row ${row.line}: ${message}` });

      if (!email && !mobile) {
        fail("Add the subscriber email or mobile.");
        continue;
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        fail("Email is not valid.");
        continue;
      }
      if (!amount) {
        fail("Payment amount is whole rupees.");
        continue;
      }
      if (!paidOn || paidOn === "invalid") {
        fail("Date must be YYYY-MM-DD or DD/MM/YYYY.");
        continue;
      }
      if (source === "invalid") {
        fail("Source must be UPI, Cash, or Internet.");
        continue;
      }
      if (transactionId.length > 64) {
        fail("Transaction id is too long.");
        continue;
      }

      const match = email
        ? one<{ id: number; name: string; mobile: string; provider_id: number; role: string }>(
            `SELECT c.id, u.name, c.mobile, u.provider_id, u.role
             FROM users u
             LEFT JOIN customers c ON c.user_id = u.id
             WHERE lower(u.email) = ?`,
            email,
          )
        : null;
      let customerId = 0;
      let customerName = "";
      let customerMobile = "";
      if (email) {
        if (!match || match.provider_id !== session.providerId || match.role !== "customer" || !match.id) {
          fail("No subscriber with that email is on this desk.");
          continue;
        }
        customerId = match.id;
        customerName = match.name;
        customerMobile = match.mobile;
        if (mobile && phoneDigits(customerMobile) !== mobile) {
          fail("That mobile does not match this subscriber.");
          continue;
        }
      } else {
        const found = many<{ id: number; name: string; mobile: string }>(
          `SELECT c.id, u.name, c.mobile
           FROM customers c
           JOIN users u ON u.id = c.user_id
           WHERE u.provider_id = ? AND u.role = 'customer' AND replace(c.mobile, ' ', '') = ?`,
          session.providerId,
          mobile,
        );
        if (found.length === 0) {
          fail("No subscriber with that mobile is on this desk.");
          continue;
        }
        if (found.length > 1) {
          fail("More than one subscriber uses that mobile. Add the email.");
          continue;
        }
        customerId = found[0].id;
        customerName = found[0].name;
        customerMobile = found[0].mobile;
      }
      if (name && customerName.trim().toLowerCase() !== name.toLowerCase()) {
        fail("That name does not match this subscriber.");
        continue;
      }

      const reference = transactionId || makeRef();
      const refKey = transactionId.toLowerCase();
      if (transactionId) {
        if (seenRefs.has(refKey)) {
          fail("That transaction id is already on this file.");
          continue;
        }
        const used = one(
          `SELECT pay.id
           FROM payments pay
           JOIN customers c ON c.id = pay.customer_id
           JOIN users u ON u.id = c.user_id
           WHERE u.provider_id = ? AND lower(pay.reference) = ?`,
          session.providerId,
          refKey,
        );
        if (used) {
          fail("That transaction id is already recorded.");
          continue;
        }
      } else {
        const cashKey = `${customerId}:${amount}:${paidOn}:${source}`;
        if (seenCash.has(cashKey)) {
          fail("That payment is already on this file.");
          continue;
        }
        const same = one(
          "SELECT id FROM payments WHERE customer_id = ? AND amount = ? AND method = ? AND substr(paid_at, 1, 10) = ?",
          customerId,
          amount,
          source,
          paidOn,
        );
        if (same) {
          fail("That payment is already on this subscriber.");
          continue;
        }
      }

      const current = getSubscriber(customerId, session.providerId);
      if (!current) {
        fail("That subscriber was not found.");
        continue;
      }
      const charges = listCustomerCharges(customerId);
      const discounts = listCustomerDiscounts(customerId);
      const extraPlans = listCustomerExtraPlans(customerId);
      const due = invoiceFor(current, charges, { discounts, extraPlans }).due;
      const kind = amount >= due ? "full" : "partial";
      const periodStart = current.renew_date > paidOn ? paidOn : current.renew_date;
      const periodEnd = kind === "full" ? renewalAfterPayment(current.renew_date, current.promise_on, paidOn, current.bill_cycle) : current.renew_date;
      const lineItems =
        kind === "full"
          ? JSON.stringify(invoiceFor(current, charges, { paid: amount, discounts, extraPlans }).lines)
          : "";
      run(
        `INSERT INTO payments
          (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind, line_items)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        customerId,
        amount,
        source,
        reference,
        `${paidOn} 00:00`,
        periodStart,
        periodEnd,
        `Imported by ${session.name}`,
        kind,
        lineItems,
      );
      if (kind === "full") {
        run("UPDATE customers SET renew_date = ?, status = 'active', promise_on = '', promise_was_down = 0 WHERE id = ?", periodEnd, customerId);
        run("UPDATE customer_charges SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", customerId);
        run("UPDATE customer_discounts SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", customerId);
        if (current.plan_frequency === "once") run("UPDATE customers SET plan_billed = 1 WHERE id = ?", customerId);
        if (current.status !== "active") turnedOn.push(customerId);
      }
      if (transactionId) seenRefs.add(refKey);
      else seenCash.add(`${customerId}:${amount}:${paidOn}:${source}`);
      imported += 1;
    }
    const batch = run(
      "INSERT INTO import_batches (provider_id, created_at, imported, updated, skipped, kind) VALUES (?, ?, ?, 0, ?, 'payments')",
      session.providerId,
      nowStamp(),
      imported,
      issues.length,
    );
    batchId = Number(batch.lastInsertRowid);
    for (const issue of issues) {
      run("INSERT INTO import_issues (batch_id, line, message) VALUES (?, ?, ?)", batchId, issue.line, issue.message);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  let networkMisses = 0;
  for (const customerId of turnedOn) {
    const row = one<{ line_name: string }>("SELECT line_name FROM customers WHERE id = ?", customerId);
    const line = await syncNetworkLine(session.providerId, row?.line_name ?? "", true, { quietIfIdle: true });
    if (line.state === "error" || line.state === "warn") networkMisses += 1;
  }
  refresh();
  const networkNote = networkMisses ? ` ${networkMisses} line${networkMisses === 1 ? "" : "s"} stayed off on the network.` : "";
  go("/provider/payments", {
    notice: `Recorded ${imported}. Skipped ${issues.length}.${networkNote}`,
    batch: String(batchId),
  });
}

export async function importPlans(formData: FormData) {
  const session = await requireRole("admin");
  const parsed = parsePlanCsv(readText(formData, "csv"));
  if (parsed.error) go("/provider/plans", { error: parsed.error });
  if (parsed.rows.length === 0) go("/provider/plans", { error: "There are no plan rows in that file." });

  const existing = many<{ name: string }>("SELECT name FROM plans WHERE provider_id = ?", session.providerId);
  const names = new Set(existing.map((plan) => plan.name.toLowerCase()));
  const issues: { line: number; message: string }[] = [];
  let imported = 0;
  const db = getDb();
  let batchId = 0;

  db.exec("BEGIN");
  try {
    for (const row of parsed.rows) {
      const speed = wholeUnits(row.speed);
      const price = wholeUnits(row.price);
      const name = row.name.trim();
      let message = "";
      if (name.length < 2) message = "Name is missing.";
      else if (names.has(name.toLowerCase())) message = "A plan with that name already exists.";
      else if (!speed) message = "Speed must be a whole number of Mbps.";
      else if (!price) message = "Price must be a whole number of rupees.";
      else if (row.description.trim().length < 8) message = "Add a short description of who the plan is for.";
      if (message) {
        issues.push({ line: row.line, message });
        continue;
      }
      run(
        "INSERT INTO plans (provider_id, name, speed_mbps, price, data_cap, description) VALUES (?, ?, ?, ?, ?, ?)",
        session.providerId,
        name,
        speed,
        price,
        row.data.trim() || "Unlimited",
        row.description.trim(),
      );
      names.add(name.toLowerCase());
      imported += 1;
    }
    const batch = run(
      "INSERT INTO import_batches (provider_id, created_at, imported, skipped, kind) VALUES (?, ?, ?, ?, 'plans')",
      session.providerId,
      nowStamp(),
      imported,
      issues.length,
    );
    batchId = Number(batch.lastInsertRowid);
    for (const issue of issues) {
      run("INSERT INTO import_issues (batch_id, line, message) VALUES (?, ?, ?)", batchId, issue.line, issue.message);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go("/provider/plans", {
    notice: `Added ${imported}. Skipped ${issues.length}.`,
    batch: String(batchId),
  });
}

const CHARGE_KIND_IMPORT: Record<string, "router" | "installation" | "service" | "other"> = {
  router: "router",
  "router charge": "router",
  installation: "installation",
  "installation charge": "installation",
  service: "service",
  "service charge": "service",
  other: "other",
  "other charge": "other",
};

function catalogueTab(formData: FormData) {
  const tab = readText(formData, "tab");
  return tab === "charge" || tab === "discount" ? tab : "plan";
}

export async function saveChargeCatalogue(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("charge_id") || 0);
  const back = { tab: "charge", ...(id ? { edit: String(id) } : {}) };
  const name = readText(formData, "name");
  const kind = CHARGE_KIND_IMPORT[readText(formData, "kind").toLowerCase()];
  const amount = Number(formData.get("amount"));
  const tax = readBillTax(String(formData.get("tax") ?? "included"), String(formData.get("tax_percent") ?? ""));
  if (name.length < 2 || name.length > 40) go("/provider/plans", { ...back, error: "Name the one-time charge in a few words." });
  if (!kind) go("/provider/plans", { ...back, error: "Choose Router, Installation, Service, or Other." });
  if (!Number.isInteger(amount) || amount <= 0) go("/provider/plans", { ...back, error: "Enter the amount in whole rupees." });
  if (!tax.ok) go("/provider/plans", { ...back, error: "Tax is a percent such as 18, or included." });
  const clash = one<{ id: number }>(
    "SELECT id FROM charge_catalogue WHERE provider_id = ? AND name = ? AND id != ?",
    session.providerId,
    name,
    id,
  );
  if (clash) go("/provider/plans", { ...back, error: "A one-time charge with that name already exists." });
  if (id) {
    if (!one("SELECT id FROM charge_catalogue WHERE id = ? AND provider_id = ?", id, session.providerId)) {
      go("/provider/plans", { tab: "charge", error: "That one-time charge was not found." });
    }
    run(
      "UPDATE charge_catalogue SET name = ?, kind = ?, amount = ?, tax_included = ?, tax_percent = ? WHERE id = ? AND provider_id = ?",
      name,
      kind,
      amount,
      tax.taxIncluded ? 1 : 0,
      tax.taxPercent,
      id,
      session.providerId,
    );
  } else {
    run(
      "INSERT INTO charge_catalogue (provider_id, name, kind, amount, tax_included, tax_percent) VALUES (?, ?, ?, ?, ?, ?)",
      session.providerId,
      name,
      kind,
      amount,
      tax.taxIncluded ? 1 : 0,
      tax.taxPercent,
    );
  }
  refresh();
  go("/provider/plans", { tab: "charge", notice: id ? "One-time charge updated." : "One-time charge added to the catalogue." });
}

export async function saveDiscountCatalogue(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("discount_id") || 0);
  const back = { tab: "discount", ...(id ? { edit: String(id) } : {}) };
  const name = readText(formData, "name");
  const applies = readText(formData, "applies_to");
  const oneTime = applies === "router" || applies === "installation" || applies === "service";
  const frequency = oneTime ? "once" : readText(formData, "frequency");
  const mode = readText(formData, "mode");
  const value = Number(formData.get("value"));
  const planId = applies.startsWith("plan:") ? Number(applies.slice(5)) : 0;
  if (name.length < 2 || name.length > 40) go("/provider/plans", { ...back, error: "Name the promo or discount in a few words." });
  if (planId) {
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", planId, session.providerId)) {
      go("/provider/plans", { ...back, error: "Choose an internet plan that is still on the catalogue." });
    }
  } else if (!["router", "installation", "service", "invoice"].includes(applies)) {
    go("/provider/plans", { ...back, error: "Choose what the discount applies to." });
  }
  if (frequency !== "once" && frequency !== "recurring") {
    go("/provider/plans", { ...back, error: "Choose one time, or always with the internet plan." });
  }
  if (mode !== "amount" && mode !== "percent") go("/provider/plans", { ...back, error: "Choose an amount or a percent." });
  if (!Number.isInteger(value) || value <= 0 || (mode === "percent" && value > 100)) {
    go("/provider/plans", { ...back, error: "Enter a whole number of rupees, or a percent up to 100." });
  }
  const clash = one<{ id: number }>(
    "SELECT id FROM discount_catalogue WHERE provider_id = ? AND name = ? AND id != ?",
    session.providerId,
    name,
    id,
  );
  if (clash) go("/provider/plans", { ...back, error: "A promo or discount with that name already exists." });
  if (id) {
    if (!one("SELECT id FROM discount_catalogue WHERE id = ? AND provider_id = ?", id, session.providerId)) {
      go("/provider/plans", { tab: "discount", error: "That promo or discount was not found." });
    }
    run(
      "UPDATE discount_catalogue SET name = ?, applies_to = ?, frequency = ?, mode = ?, value = ? WHERE id = ? AND provider_id = ?",
      name,
      applies,
      frequency,
      mode,
      value,
      id,
      session.providerId,
    );
  } else {
    run(
      "INSERT INTO discount_catalogue (provider_id, name, applies_to, frequency, mode, value) VALUES (?, ?, ?, ?, ?, ?)",
      session.providerId,
      name,
      applies,
      frequency,
      mode,
      value,
    );
  }
  refresh();
  go("/provider/plans", { tab: "discount", notice: id ? "Promo or discount updated." : "Promo or discount added to the catalogue." });
}

function discountAppliesFromImport(value: string, plans: Map<string, number>) {
  const key = value.trim().toLowerCase();
  const fixed: Record<string, string> = {
    router: "router",
    "router charge": "router",
    installation: "installation",
    "installation charge": "installation",
    service: "service",
    "service charge": "service",
    invoice: "invoice",
    "full invoice": "invoice",
  };
  if (fixed[key]) return fixed[key];
  const planId = plans.get(key);
  return planId ? `plan:${planId}` : "";
}

function discountModeFromImport(value: string) {
  const key = value.trim().toLowerCase().replace(/\s+/g, "");
  if (["amount", "rupee", "rupees", "rs", "₹"].includes(key)) return "amount";
  if (["percent", "percentage", "%", "%age", "pct"].includes(key)) return "percent";
  return "";
}

function discountTimingFromImport(value: string, applies: string) {
  const locked = applies === "router" || applies === "installation" || applies === "service";
  const key = value.trim().toLowerCase();
  if (!key || key === "null" || key === "na" || key === "n/a") return locked ? "once" : "recurring";
  if (["once", "one-time", "one time", "onetime"].includes(key)) return "once";
  if (["recurring", "always", "always with internet plan", "always with plan"].includes(key)) return locked ? "invalid" : "recurring";
  return "invalid";
}

export async function importCatalogue(formData: FormData) {
  const session = await requireRole("admin");
  const upload = formData.get("workbook");
  const pasted = readText(formData, "csv");
  let plans: SheetRow[] = [];
  let charges: SheetRow[] = [];
  let discounts: SheetRow[] = [];

  if (upload instanceof File && upload.size > 0) {
    const bytes = Buffer.from(await upload.arrayBuffer());
    const csv = upload.name.toLowerCase().endsWith(".csv") || upload.type.includes("csv");
    if (csv) {
      const parsed = parsePlanCsv(bytes.toString("utf8"));
      if (parsed.error) go("/provider/plans", { error: parsed.error });
      plans = parsed.rows.map((row) => ({
        line: row.line,
        cells: { name: row.name, speed: row.speed, price: row.price, data: row.data, description: row.description },
      }));
    } else {
      const parsed = await readCatalogueWorkbook(bytes);
      if (!parsed.ok) go("/provider/plans", { error: parsed.error });
      plans = parsed.plans;
      charges = parsed.charges;
      discounts = parsed.discounts;
    }
  } else if (pasted) {
    const parsed = parsePlanCsv(pasted);
    if (parsed.error) go("/provider/plans", { error: parsed.error });
    plans = parsed.rows.map((row) => ({
      line: row.line,
      cells: { name: row.name, speed: row.speed, price: row.price, data: row.data, description: row.description },
    }));
  } else {
    go("/provider/plans", { error: "Choose the catalogue spreadsheet, or paste a plan CSV." });
  }

  if (plans.length + charges.length + discounts.length === 0) {
    go("/provider/plans", { error: "The file has no rows to import." });
  }

  const planNames = new Set(many<{ name: string }>("SELECT name FROM plans WHERE provider_id = ?", session.providerId).map((plan) => plan.name.toLowerCase()));
  const chargeNames = new Set(many<{ name: string }>("SELECT name FROM charge_catalogue WHERE provider_id = ?", session.providerId).map((item) => item.name.toLowerCase()));
  const discountNames = new Set(many<{ name: string }>("SELECT name FROM discount_catalogue WHERE provider_id = ?", session.providerId).map((item) => item.name.toLowerCase()));
  const planIds = new Map(many<{ id: number; name: string }>("SELECT id, name FROM plans WHERE provider_id = ?", session.providerId).map((plan) => [plan.name.toLowerCase(), plan.id]));
  const issues: { line: number; message: string }[] = [];
  let imported = 0;
  const db = getDb();
  let batchId = 0;

  db.exec("BEGIN");
  try {
    for (const row of plans) {
      const name = row.cells.name.trim();
      const speed = wholeUnits(row.cells.speed);
      const price = wholeUnits(row.cells.price);
      let message = "";
      if (name.length < 2) message = "Name is missing.";
      else if (planNames.has(name.toLowerCase())) message = "A plan with that name already exists.";
      else if (!speed) message = "Speed must be a whole number of Mbps.";
      else if (!price) message = "Price must be a whole number of rupees.";
      else if ((row.cells.description ?? "").trim().length < 8) message = "Add a short description of who the plan is for.";
      if (message) {
        issues.push({ line: row.line, message: `Internet Plan, row ${row.line}: ${message}` });
        continue;
      }
      const inserted = run(
        "INSERT INTO plans (provider_id, name, speed_mbps, price, data_cap, description) VALUES (?, ?, ?, ?, ?, ?)",
        session.providerId,
        name,
        speed,
        price,
        (row.cells.data ?? "").trim() || "Unlimited",
        row.cells.description.trim(),
      );
      planNames.add(name.toLowerCase());
      planIds.set(name.toLowerCase(), Number(inserted.lastInsertRowid));
      imported += 1;
    }
    for (const row of charges) {
      const name = row.cells.name.trim();
      const kind = CHARGE_KIND_IMPORT[row.cells.type.trim().toLowerCase()];
      const amount = wholeUnits(row.cells.amount);
      const tax = parseChargeTax(row.cells.tax ?? "");
      let message = "";
      if (name.length < 2 || name.length > 40) message = "Name the one-time charge in a few words.";
      else if (chargeNames.has(name.toLowerCase())) message = "A one-time charge with that name already exists.";
      else if (!kind) message = "Type must be router, installation, service, or other.";
      else if (!amount) message = "Amount must be a whole number of rupees.";
      else if (!tax.ok) message = "Tax is a percent such as 18, or blank when the amount already includes tax.";
      if (message) {
        issues.push({ line: row.line, message: `One-time charge, row ${row.line}: ${message}` });
        continue;
      }
      run(
        "INSERT INTO charge_catalogue (provider_id, name, kind, amount, tax_included, tax_percent) VALUES (?, ?, ?, ?, ?, ?)",
        session.providerId,
        name,
        kind,
        amount,
        tax.ok && !tax.taxIncluded ? 0 : 1,
        tax.ok ? tax.taxPercent : 0,
      );
      chargeNames.add(name.toLowerCase());
      imported += 1;
    }
    for (const row of discounts) {
      const name = row.cells.name.trim();
      const applies = discountAppliesFromImport(row.cells.applies, planIds);
      const timing = applies ? discountTimingFromImport(row.cells.frequency ?? "", applies) : "invalid";
      const mode = discountModeFromImport(row.cells.mode);
      const value = wholeUnits(String(row.cells.value).replace(/%/g, ""));
      let message = "";
      if (name.length < 2 || name.length > 40) message = "Name the promo or discount in a few words.";
      else if (discountNames.has(name.toLowerCase())) message = "A promo or discount with that name already exists.";
      else if (!applies) message = "Applies to an internet plan, router, installation, service, or the full invoice.";
      else if (timing === "invalid") message = "Frequency is one time, or always with the internet plan. A one-time charge can only take a one-time discount.";
      else if (!mode) message = "Mode is amount or percent.";
      else if (!value || (mode === "percent" && value > 100)) message = "Value is a whole number of rupees, or a percent up to 100.";
      if (message) {
        issues.push({ line: row.line, message: `Promo & Discounts, row ${row.line}: ${message}` });
        continue;
      }
      run(
        "INSERT INTO discount_catalogue (provider_id, name, applies_to, frequency, mode, value) VALUES (?, ?, ?, ?, ?, ?)",
        session.providerId,
        name,
        applies,
        timing,
        mode,
        value,
      );
      discountNames.add(name.toLowerCase());
      imported += 1;
    }
    const batch = run(
      "INSERT INTO import_batches (provider_id, created_at, imported, skipped, kind) VALUES (?, ?, ?, ?, 'catalogue')",
      session.providerId,
      nowStamp(),
      imported,
      issues.length,
    );
    batchId = Number(batch.lastInsertRowid);
    for (const issue of issues) {
      run("INSERT INTO import_issues (batch_id, line, message) VALUES (?, ?, ?)", batchId, issue.line, issue.message);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go("/provider/plans", {
    tab: catalogueTab(formData),
    notice: `Added ${imported}. Skipped ${issues.length}.`,
    batch: String(batchId),
  });
}

export async function inviteStaff(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/team", { error: "Only the desk owner can add staff." });
  const usage = getUsage(session.providerId);
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const mobile = readText(formData, "mobile").replace(/\s+/g, "");
  if (name.length < 2) go("/provider/team", { error: "Enter the staff member's name." });
  if (!/^[6-9]\d{9}$/.test(mobile)) go("/provider/team", { error: "Enter a 10-digit mobile number." });
  if (!/^\S+@\S+\.\S+$/.test(email)) go("/provider/team", { error: "Enter a valid email." });
  if (one("SELECT id FROM users WHERE email = ?", email)) go("/provider/team", { error: "That email is already used for a login." });
  const password = crypto.randomBytes(4).toString("hex");
  run(
    "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner, mobile, login_password) VALUES (?, ?, 'admin', ?, ?, ?, 0, ?, ?)",
    email,
    hashPassword(password),
    name,
    nowStamp(),
    session.providerId,
    mobile,
    password,
  );
  refresh();
  const over = usage.staff + 1 > usage.staffCap;
  go("/provider/team", {
    notice: over
      ? `${name} is on the team list. This login is above the ${limitLabel(usage.staffCap)} included on ${usage.catalog.label}, at ₹10 per month.`
      : `${name} is on the team list, with email, password, and mobile saved on this page.`,
  });
}

export async function reissueStaffPassword(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/team", { error: "Only the desk owner can set a staff password." });
  const id = Number(formData.get("staff_id"));
  const person = one<{ id: number; name: string; is_owner: number }>(
    "SELECT id, name, is_owner FROM users WHERE id = ? AND provider_id = ? AND role = 'admin'",
    id,
    session.providerId,
  );
  if (!person || person.is_owner) go("/provider/team", { error: "That staff login was not found." });
  const password = crypto.randomBytes(4).toString("hex");
  run(
    "UPDATE users SET password_hash = ?, login_password = ? WHERE id = ?",
    hashPassword(password),
    password,
    person.id,
  );
  refresh();
  go("/provider/team", { notice: `A new password for ${person.name} is saved on this page.` });
}

export async function openUpgradeCheckout(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/upgrade", { error: "Only the desk owner can change the plan." });
  const requested = readText(formData, "product_plan");
  const term: BillTerm = isBillTerm(readText(formData, "billing_term")) ? (readText(formData, "billing_term") as BillTerm) : "monthly";
  const usage = getUsage(session.providerId);
  let nextPlan: ProductPlan;
  let subscriberBase = usage.subscriberBase;
  if (requested === "premium") {
    const base = Number(readText(formData, "subscriber_base"));
    const quote = quotePremium(base);
    if (!quote.ok) go("/provider/upgrade", { error: quote.error });
    nextPlan = quote.plan;
    subscriberBase = base;
  } else if (requested === "pro" || requested === "ultra") {
    nextPlan = requested;
  } else {
    go("/provider/upgrade", { error: "Choose Pro, Ultra, or Premium." });
  }
  const nextCustomers = customerLimit(nextPlan);
  if (usage.customers > nextCustomers) {
    go("/provider/upgrade", {
      error: `${CATALOG[nextPlan].label} holds ${limitLabel(nextCustomers)} customers. This desk has ${usage.customers}.`,
    });
  }
  const currentTerm: BillTerm = usage.provider?.billing_term && isBillTerm(usage.provider.billing_term) ? usage.provider.billing_term : "monthly";
  const sameOffer = nextPlan === usage.plan && subscriberBase === usage.subscriberBase && term === currentTerm;
  if (sameOffer && !usage.trial.active) {
    go("/provider/upgrade", { error: "This desk is already on that plan." });
  }
  const provider = usage.provider;
  const platform = getPlatformProfile();
  const quote = termQuote(CATALOG[nextPlan].price, term);
  const amount = quote.due;
  const taxed = platform.gstin ? gstIncluded(amount) : { tax: 0, total: amount };
  const mode = platform.gstin ? gstMode(platform.state, provider?.state ?? "") : "none";
  const termLabel = BILL_TERMS.find((item) => item.id === term)?.label ?? "Monthly";
  const label = `${requested === "premium" ? "Premium" : CATALOG[nextPlan].label} · ${termLabel}`;
  const inserted = run(
    `INSERT INTO upgrade_orders (
      provider_id, product_plan, subscriber_base, plan_label, plan_amount, tax, total, gst_mode, status, created_at, billing_term
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    session.providerId,
    nextPlan,
    subscriberBase,
    label,
    amount,
    taxed.tax,
    taxed.total,
    mode,
    nowStamp(),
    term,
  );
  redirect(`/provider/upgrade/pay/${Number(inserted.lastInsertRowid)}`);
}

export async function applyUpgradePromo(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(readText(formData, "order_id"));
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", id);
  if (!order || order.provider_id !== session.providerId) go("/provider/upgrade", { error: "That payment was not found." });
  if (!session.isOwner) go(`/provider/upgrade/pay/${id}/checkout`, { error: "Only the desk owner can pay for a plan." });
  if (order.status === "paid") redirect("/provider/upgrade");
  const coupon = findPlanCoupon(readText(formData, "promo"));
  if (!coupon) go(`/provider/upgrade/pay/${id}/checkout`, { error: "That promo code is not active." });
  if (coupon.provider_id > 0 && coupon.provider_id !== order.provider_id) {
    go(`/provider/upgrade/pay/${id}/checkout`, { error: "That promo code is not for this desk." });
  }
  if (coupon.provider_id > 0) {
    const used = one<{ id: number }>(
      "SELECT id FROM upgrade_orders WHERE provider_id = ? AND id <> ? AND lower(promo_code) = ? AND promo_off > 0",
      order.provider_id,
      order.id,
      coupon.code.toLowerCase(),
    );
    if (used) go(`/provider/upgrade/pay/${id}/checkout`, { error: "This promo code has already been used on this desk." });
  }
  const off = promoOff(order.total, coupon.mode, coupon.value);
  run("UPDATE upgrade_orders SET promo_code = ?, promo_off = ? WHERE id = ?", coupon.code, off, order.id);
  refresh();
  go(`/provider/upgrade/pay/${id}/checkout`, { notice: `Promo ${coupon.code} takes ${formatInr(off)} off this payment.` });
}

export async function clearUpgradePromo(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(readText(formData, "order_id"));
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", id);
  if (!order || order.provider_id !== session.providerId || !session.isOwner) go("/provider/upgrade", { error: "That payment was not found." });
  run("UPDATE upgrade_orders SET promo_code = '', promo_off = 0 WHERE id = ?", order.id);
  refresh();
  redirect(`/provider/upgrade/pay/${id}/checkout`);
}

export async function applySubscriberPromo(formData: FormData) {
  const session = await requireRole("customer");
  if (!allows(session.productPlan, "onlinePay")) go("/subscriber/pay", { error: "Online renewal is not on this desk plan. Pay the office for now." });
  const current = getSubscriberByUserId(session.uid);
  if (!current) go("/subscriber", { error: "No service line is linked to this login." });
  const promo = findCataloguePromo(session.providerId, readText(formData, "promo"));
  if (!promo || (promo.mode !== "amount" && promo.mode !== "percent")) {
    go("/subscriber/pay", { error: "That promo code is not on this connection." });
  }
  const already = listCustomerDiscounts(current.id).some((discount) => discount.name.toLowerCase() === promo.name.toLowerCase());
  if (already) go("/subscriber/pay", { error: "That promo is already on this bill." });
  go("/subscriber/pay", { promo: promo.name, notice: `Promo ${promo.name} is ready on this payment.` });
}

export async function savePlanCoupon(formData: FormData) {
  await requireOperator();
  const code = readText(formData, "code").toUpperCase().replace(/\s+/g, "");
  const mode = readText(formData, "mode");
  const value = Number(formData.get("value"));
  if (!/^[A-Z0-9]{3,20}$/.test(code)) go("/zignal/settings", { error: "Use 3 to 20 letters or numbers for the promo code." });
  if (mode !== "amount" && mode !== "percent") go("/zignal/settings", { error: "Choose rupees or percent." });
  if (mode === "percent" && (!Number.isInteger(value) || value < 1 || value > 100)) {
    go("/zignal/settings", { error: "A percent promo is a whole number from 1 to 100." });
  }
  if (mode === "amount" && (!Number.isInteger(value) || value < 1)) {
    go("/zignal/settings", { error: "Enter the promo in whole rupees." });
  }
  const providerId = Number(formData.get("provider_id"));
  if (!Number.isInteger(providerId) || providerId < 0) go("/zignal/settings", { error: "Choose an ISP, or leave the code open to every desk." });
  const desk = providerId > 0 ? getProvider(providerId) : undefined;
  if (providerId > 0 && !desk) go("/zignal/settings", { error: "That ISP was not found." });
  if (one("SELECT id FROM plan_coupons WHERE lower(code) = ?", code.toLowerCase())) {
    go("/zignal/settings", { error: "That promo code already exists." });
  }
  run(
    "INSERT INTO plan_coupons (code, mode, value, active, created_at, provider_id) VALUES (?, ?, ?, 1, ?, ?)",
    code,
    mode,
    value,
    nowStamp(),
    providerId,
  );
  refresh();
  go("/zignal/settings", {
    notice: desk ? `Promo ${code} is ready for ${desk.name}. That desk can use it once.` : `Promo ${code} is ready for any desk.`,
  });
}

export async function retirePlanCoupon(formData: FormData) {
  await requireOperator();
  const id = Number(formData.get("coupon_id"));
  run("UPDATE plan_coupons SET active = 0, deactivated_at = ? WHERE id = ? AND active = 1", nowStamp(), id);
  refresh();
  go("/zignal/settings", { notice: "Promo turned off." });
}

export async function payUpgrade(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(readText(formData, "order_id"));
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", id);
  if (!order || order.provider_id !== session.providerId) go("/provider/upgrade", { error: "That payment was not found." });
  if (!session.isOwner) go(`/provider/upgrade/pay/${id}`, { error: "Only the desk owner can pay for a plan." });
  if (order.status === "paid") redirect("/provider/upgrade?notice=Plan%20updated.");
  const instrument = readGatewayPayment(formData);
  if (!instrument.ok) go(`/provider/upgrade/pay/${id}/checkout`, { error: instrument.error });
  let payment = instrument.payment;
  if (payment.method === "Auto-pay") {
    const saved = savedPaymentLine(getProvider(session.providerId));
    if (!saved) go(`/provider/upgrade/pay/${id}/checkout`, { error: "Save a payment method in Settings before using auto-pay." });
    payment = { method: "Auto-pay", detail: saved };
  }
  const payable = orderPayable(order);
  if (payable > 0) {
    const result = collectUpgradePayment(order.id, payment);
    if (!result.ok) redirect(`/provider/upgrade/pay/${id}/checkout?notice=gateway`);
  }
  markUpgradePaid(order.id);
  refresh();
  redirect("/provider/upgrade?notice=Plan%20updated.");
}

export async function changeProductPlan(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/upgrade", { error: "Only the desk owner can change the plan." });
  const nextPlan = readText(formData, "product_plan");
  if (!isProductPlan(nextPlan)) go("/provider/upgrade", { error: "Choose Pro, Ultra, or a Premium tier." });
  const usage = getUsage(session.providerId);
  const nextCustomers = customerLimit(nextPlan);
  if (usage.customers > nextCustomers) {
    go("/provider/upgrade", {
      error: `${CATALOG[nextPlan].label} holds ${limitLabel(nextCustomers)} customers. This desk has ${usage.customers}.`,
    });
  }
  run("UPDATE providers SET product_plan = ? WHERE id = ?", nextPlan, session.providerId);
  refresh();
  go("/provider/upgrade", { notice: `This desk is now on ${CATALOG[nextPlan].label}.` });
}

const COMPLAINT_CATEGORIES = ["no_internet", "slow", "drops", "other"] as const;

export async function raiseComplaint(formData: FormData) {
  const session = await requireRole("customer");
  const current = getSubscriberByUserId(session.uid);
  if (!current) go("/subscriber/complaints", { error: "No service line is linked to this login." });

  const category = readText(formData, "category");
  const details = readText(formData, "details");
  if (!COMPLAINT_CATEGORIES.includes(category as (typeof COMPLAINT_CATEGORIES)[number])) {
    go("/subscriber/complaints", { error: "Choose the kind of problem." });
  }
  if (details.length < 8) go("/subscriber/complaints", { error: "Describe what is happening, in a sentence or two." });
  if (details.length > 500) go("/subscriber/complaints", { error: "Keep the complaint under 500 characters." });

  const stamp = nowStamp();
  const saved = run(
    `INSERT INTO complaints
      (customer_id, category, details, status, provider_note, created_at, updated_at, sla_hours)
     VALUES (?, ?, ?, 'open', '', ?, ?, ?)`,
    current.id,
    category,
    details,
    stamp,
    stamp,
    slaHoursFor(category),
  );
  refresh();
  const code = complaintCode(Number(saved.lastInsertRowid));
  go("/subscriber/complaints", { notice: `Complaint ${code} sent to your provider. You can follow it on this page.` });
}

const CHAT_COMPLAINTS: Record<string, { category: "slow" | "no_internet"; details: string }> = {
  slow: { category: "slow", details: "Internet is slow. Raised from the subscriber chat." },
  not_working: { category: "no_internet", details: "Internet is not working. Raised from the subscriber chat." },
  down: { category: "no_internet", details: "Internet is down. Raised from the subscriber chat." },
};

export async function raiseChatComplaint(kind: string) {
  const session = await requireRole("customer");
  const current = getSubscriberByUserId(session.uid);
  if (!current) return { ok: false as const, error: "No service line is linked to this login." };
  const ticket = CHAT_COMPLAINTS[kind];
  if (!ticket) return { ok: false as const, error: "Choose one of the connection questions." };

  const open = one<{ id: number }>(
    `SELECT id FROM complaints
     WHERE customer_id = ? AND category = ? AND details = ? AND status NOT IN ('closed', 'cancelled', 'duplicate')
     ORDER BY id DESC LIMIT 1`,
    current.id,
    ticket.category,
    ticket.details,
  );
  if (open) {
    return { ok: true as const, code: complaintCode(open.id), opened: false };
  }

  const stamp = nowStamp();
  const saved = run(
    `INSERT INTO complaints
      (customer_id, category, details, status, provider_note, created_at, updated_at, sla_hours)
     VALUES (?, ?, ?, 'open', '', ?, ?, ?)`,
    current.id,
    ticket.category,
    ticket.details,
    stamp,
    stamp,
    slaHoursFor(ticket.category),
  );
  refresh();
  return { ok: true as const, code: complaintCode(Number(saved.lastInsertRowid)), opened: true };
}

export async function updateComplaint(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("complaint_id"));
  const status = readText(formData, "status");
  const note = readText(formData, "provider_note");
  const assigneeId = Number(formData.get("assignee_id") || 0);
  if (!isComplaintStatus(status)) {
    go("/provider/complaints", { error: "Choose a status." });
  }
  if (note.length > 400) go("/provider/complaints", { error: "Keep the note under 400 characters." });
  if (status === "in_progress" && !assigneeId) {
    go("/provider/complaints", { error: "Choose who will work on this complaint." });
  }
  if (assigneeId) {
    const staff = one(
      "SELECT id FROM users WHERE id = ? AND provider_id = ? AND role = 'admin'",
      assigneeId,
      session.providerId,
    );
    if (!staff) go("/provider/complaints", { error: "That assignee is not on this desk." });
  }
  const ticket = one<{ id: number; resolved_at: string }>(
    `SELECT k.id, k.resolved_at
     FROM complaints k
     JOIN customers c ON c.id = k.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE k.id = ? AND u.provider_id = ?`,
    id,
    session.providerId,
  );
  if (!ticket) go("/provider/complaints", { error: "That complaint was not found." });
  const now = nowStamp();
  const resolvedAt = complaintIsFinished(status) ? ticket.resolved_at || now : "";
  run(
    "UPDATE complaints SET status = ?, provider_note = ?, assignee_id = ?, resolved_at = ?, updated_at = ? WHERE id = ?",
    status,
    note,
    assigneeId || null,
    resolvedAt,
    now,
    id,
  );
  refresh();
  go("/provider/complaints", { notice: "Complaint updated." });
}

export async function saveBrand(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/upgrade", { error: "Only the desk owner can change the ISP name." });
  const name = readText(formData, "isp_name");
  const phone = readText(formData, "support_phone").replace(/\s+/g, "");
  const logo = readText(formData, "logo_letter").slice(0, 2).toUpperCase();
  const gstin = cleanGstin(readText(formData, "gstin"));
  const address = readText(formData, "address");
  const city = readText(formData, "city");
  const state = readText(formData, "state");
  const country = readText(formData, "country");
  const pincode = readText(formData, "pincode").replace(/\s+/g, "");
  if (name.length < 2) go("/provider/upgrade", { error: "Enter your ISP name." });
  if (pincode && !/^\d{6}$/.test(pincode)) go("/provider/upgrade", { error: "Enter a 6-digit PIN code." });
  if (phone && !/^[6-9]\d{9}$/.test(phone)) go("/provider/upgrade", { error: "Enter a 10-digit support number, or leave it blank." });
  if (!isIndianState(state)) go("/provider/upgrade", { error: "Choose a state." });
  if (address.length > 160) go("/provider/upgrade", { error: "Keep the address shorter." });
  if (country.length > 40) go("/provider/upgrade", { error: "Keep the country name shorter." });
  const currentLogo = one<{ logo_letter: string }>("SELECT logo_letter FROM providers WHERE id = ?", session.providerId);
  run(
    "UPDATE providers SET name = ?, support_phone = ?, logo_letter = ?, gstin = ?, address = ?, city = ?, state = ?, country = ?, pincode = ? WHERE id = ?",
    name,
    phone,
    allows(session.productPlan, "logo") ? logo : (currentLogo?.logo_letter ?? ""),
    gstin,
    address,
    city,
    state,
    country,
    pincode,
    session.providerId,
  );
  refresh();
  go("/provider/upgrade", { notice: "ISP details saved. New subscriber receipts use this GSTIN and address." });
}

export async function saveDeskMail(formData: FormData) {
  await requireOperator();
  const on = String(formData.get("desk_mail_on") ?? "") === "0" ? 0 : 1;
  const soonTitle = readText(formData, "soon_title");
  const soonBody = readText(formData, "soon_body");
  const dueTitle = readText(formData, "due_title");
  const dueBody = readText(formData, "due_body");
  if (soonTitle.length < 3 || dueTitle.length < 3 || soonTitle.length > 80 || dueTitle.length > 80) {
    go("/zignal/mail", { error: "Each title needs a few words, and no more than 80 characters." });
  }
  if (soonBody.length < 3 || dueBody.length < 3 || soonBody.length > 400 || dueBody.length > 400) {
    go("/zignal/mail", { error: "Each message needs a few words, and no more than 400 characters." });
  }
  run(
    `UPDATE platform_profile
     SET desk_mail_on = ?, desk_soon_title = ?, desk_soon_body = ?, desk_due_title = ?, desk_due_body = ?
     WHERE id = 1`,
    on,
    soonTitle,
    soonBody,
    dueTitle,
    dueBody,
  );
  refresh();
  go("/zignal/mail", { notice: "Desk mail saved." });
}

export async function sendDeskMail(formData: FormData) {
  await requireOperator();
  const target = readText(formData, "provider_id");
  const channel = readText(formData, "channel");
  const title = readText(formData, "title");
  const body = readText(formData, "body");
  const back = deskReturn(formData);
  if (channel !== "email") go(back, { error: "Email is the only medium connected. Message and WhatsApp are not connected yet." });
  if (title.length < 3 || body.length < 3) go(back, { error: "A note needs a title and a message." });
  if (title.length > 80 || body.length > 400) go(back, { error: "That note is too long." });
  if (!mailConfigured()) go(back, { error: "Email is not connected yet, so the note was not sent." });
  const ids = target === "all" ? listOpenDesks().map((desk) => desk.id) : [Number(target)];
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    go(back, { error: "Choose a desk." });
  }
  let sent = 0;
  let detail = "The note could not be sent.";
  for (const id of ids) {
    const result = await sendDeskNote(id, title, body);
    if (result.ok) sent += 1;
    else if (result.detail) detail = result.detail;
  }
  refresh();
  if (sent === 0) go(back, { error: detail });
  go(back, { notice: sent === 1 ? "The note was sent to 1 desk." : `The note was sent to ${sent} desks.` });
}

export async function savePlatformProfile(formData: FormData) {
  await requireOperator();
  const name = readText(formData, "legal_name");
  const gstin = cleanGstin(readText(formData, "gstin"));
  const address = readText(formData, "address");
  const city = readText(formData, "city");
  const state = readText(formData, "state");
  const phone = readText(formData, "phone").replace(/\s+/g, "");
  const email = readText(formData, "email");
  if (name.length < 2) go("/zignal/settings", { error: "Enter the legal name for receipts." });
  if (!isGstin(gstin)) go("/zignal/settings", { error: "Enter a 15-character GSTIN, or leave it blank." });
  if (!isIndianState(state)) go("/zignal/settings", { error: "Choose a state." });
  if (address.length > 160) go("/zignal/settings", { error: "Keep the address shorter." });
  if (phone && !/^[0-9]{8,15}$/.test(phone)) go("/zignal/settings", { error: "Enter a phone number, or leave it blank." });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) go("/zignal/settings", { error: "Enter a valid email, or leave it blank." });
  run(
    `UPDATE platform_profile
     SET legal_name = ?, gstin = ?, address = ?, city = ?, state = ?, phone = ?, email = ?
     WHERE id = 1`,
    name,
    gstin,
    address,
    city,
    state,
    phone,
    email,
  );
  refresh();
  go("/zignal/settings", { notice: "Receipt details saved. Desk fees issued from now on use them." });
}

function deskReturn(formData: FormData) {
  const back = readText(formData, "return_to");
  if (/^\/zignal\/provider\/\d+(\?[A-Za-z0-9_=&-]*)?$/.test(back)) return back;
  return "/zignal/mail";
}

export async function saveDeskPromise(formData: FormData) {
  await requireOperator();
  const id = Number(formData.get("provider_id"));
  const back = `/zignal/provider/${id}?tab=invoice`;
  const provider = Number.isInteger(id) ? getProvider(id) : undefined;
  if (!provider || provider.closed_at) go(back, { error: "That desk is closed." });
  const term: BillTerm = isBillTerm(provider.billing_term) ? provider.billing_term : "monthly";
  const dueOn = nextDeskFeeDate(provider.trial_ends, provider.created_at, term);
  if (!isDate(dueOn)) go(back, { error: "This desk has no fee date yet." });
  const date = readText(formData, "promise_on");
  const window = promiseWindow(dueOn, todayISO());
  if (!isDate(date) || date < window.earliest || date > window.latest) {
    go(back, { error: "Pick a promise date within 14 days after the desk fee date." });
  }
  run("UPDATE providers SET promise_on = ? WHERE id = ?", date, id);
  refresh();
  go(back, { notice: `Promise saved. Pay by ${formatDate(date)}. The next desk fee stays on ${formatDate(dueOn)}.` });
}

export async function cancelDeskPromise(formData: FormData) {
  await requireOperator();
  const id = Number(formData.get("provider_id"));
  const back = `/zignal/provider/${id}?tab=invoice`;
  const provider = Number.isInteger(id) ? getProvider(id) : undefined;
  if (!provider?.promise_on) go(back, { error: "There is no promise on this desk." });
  run("UPDATE providers SET promise_on = '' WHERE id = ?", id);
  refresh();
  go(back, { notice: "Promise removed. The desk fee date is unchanged." });
}

export async function recordDeskPayment(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/");
  const requested = readText(formData, "return_to");
  const operatorBack = /^\/zignal\/provider\/\d+(\?[A-Za-z0-9_=&-]*)?$/.test(requested) ? requested : "/zignal/revenue";
  const back = session.kind === "operator" ? operatorBack : "/provider/revenue";
  const id = Number(formData.get("desk_payment_id"));
  const receipt =
    session.kind === "operator" ? `/zignal/receipt/${id}` : `/provider/receipt/desk/${id}`;
  const method = readText(formData, "method");
  const reference = readText(formData, "reference") || makeRef();
  const methods = ["UPI", "Bank transfer", "Cash", "Other"];
  const row = one<{ id: number; provider_id: number; paid_at: string }>(
    "SELECT id, provider_id, paid_at FROM desk_payments WHERE id = ?",
    id,
  );
  if (!row) go(back, { error: "That desk fee was not found." });
  if (session.kind === "operator") {
    /* Zignal records the fee a provider paid */
  } else if (!session.isOwner || session.role !== "admin" || session.providerId !== row.provider_id) {
    go(back, { error: "Only the desk owner can record a payment to Zignal." });
  }
  if (!methods.includes(method)) go(back, { error: "Choose how this desk fee was paid." });
  if (reference.length > 80) go(back, { error: "Keep the reference short." });
  if (row.paid_at) go(receipt);
  run("UPDATE desk_payments SET method = ?, reference = ?, paid_at = ? WHERE id = ?", method, reference, nowStamp(), id);
  run("UPDATE providers SET promise_on = '' WHERE id = ?", row.provider_id);
  refresh();
  go(receipt);
}


export async function raiseSupport(formData: FormData) {
  const session = await requireRole("admin");
  const mobile = readText(formData, "mobile").replace(/\s+/g, "");
  const message = readText(formData, "message");
  const priority = readText(formData, "priority");
  const topic = readText(formData, "topic");
  if (!/^[6-9]\d{9}$/.test(mobile)) go("/provider/support", { error: "Enter a 10-digit mobile so Zignal Connect can call you." });
  if (!SUPPORT_PRIORITIES.some((item) => item.value === priority)) go("/provider/support", { error: "Choose a priority." });
  if (!SUPPORT_TOPICS.some((item) => item.value === topic)) go("/provider/support", { error: "Choose what this message is about." });
  if (message.length < 8) go("/provider/support", { error: "Describe the concern in a sentence or two." });
  if (message.length > 800) go("/provider/support", { error: "Keep the message under 800 characters." });
  const stamp = nowStamp();
  run(
    `INSERT INTO support_requests (provider_id, user_id, mobile, message, status, reply, created_at, updated_at, priority, topic)
     VALUES (?, ?, ?, ?, 'new', '', ?, ?, ?, ?)`,
    session.providerId,
    session.uid,
    mobile,
    message,
    stamp,
    stamp,
    priority,
    topic,
  );
  refresh();
  go("/provider/support", { notice: "Sent to Zignal Connect. You can follow the reply on this page." });
}

export async function addSupportFollowup(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("request_id"));
  const message = readText(formData, "message");
  if (message.length < 2) go("/provider/support", { error: "Write a follow-up." });
  if (message.length > 800) go("/provider/support", { error: "Keep the follow-up under 800 characters." });
  const ticket = one<{ id: number; status: string }>(
    "SELECT id, status FROM support_requests WHERE id = ? AND provider_id = ?",
    id,
    session.providerId,
  );
  if (!ticket) go("/provider/support", { error: "That message was not found." });
  const stamp = nowStamp();
  run(
    "INSERT INTO support_followups (request_id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
    id,
    session.uid,
    message,
    stamp,
  );
  if (supportIsFinished(ticket.status)) {
    run("UPDATE support_requests SET status = 'new', resolved_at = '', updated_at = ? WHERE id = ?", stamp, id);
  } else {
    run("UPDATE support_requests SET updated_at = ? WHERE id = ?", stamp, id);
  }
  refresh();
  redirect(`/provider/support?${new URLSearchParams({ notice: "Follow-up added." }).toString()}#sup-${id}`);
}

export async function replySupport(formData: FormData) {
  await requireOperator();
  const id = Number(formData.get("request_id"));
  const status = readText(formData, "status");
  const reply = readText(formData, "reply");
  if (!SUPPORT_STATUSES.some((item) => item.value === status)) {
    go("/zignal/support", { error: "Choose a status.", ticket: String(id) });
  }
  if (reply.length > 800) go("/zignal/support", { error: "Keep the reply under 800 characters.", ticket: String(id) });
  const ticket = one<{ id: number; resolved_at: string }>("SELECT id, resolved_at FROM support_requests WHERE id = ?", id);
  if (!ticket) go("/zignal/support", { error: "That message was not found." });
  const stamp = nowStamp();
  const resolvedAt = supportIsFinished(status) ? ticket.resolved_at || stamp : "";
  run(
    "UPDATE support_requests SET status = ?, reply = ?, updated_at = ?, resolved_at = ? WHERE id = ?",
    status,
    reply,
    stamp,
    resolvedAt,
    id,
  );
  refresh();
  go("/zignal/support", { notice: "Reply saved. The provider can see it on Zignal support." });
}

function readTheme(value: string) {
  return value === "dark" ? "dark" : value === "light" ? "light" : "";
}

export async function saveDeskSettings(formData: FormData) {
  const session = await requireRole("admin");
  const name = readText(formData, "name");
  const mobile = readText(formData, "mobile").replace(/\s+/g, "");
  const theme = readTheme(readText(formData, "theme"));
  if (name.length < 2) go("/provider/settings", { error: "Enter your name." });
  if (mobile && !/^[6-9]\d{9}$/.test(mobile)) go("/provider/settings", { error: "Enter a 10-digit mobile, or leave it blank." });
  if (!theme) go("/provider/settings", { error: "Choose light or dark." });
  run("UPDATE users SET name = ?, mobile = ?, theme = ? WHERE id = ? AND provider_id = ?", name, mobile, theme, session.uid, session.providerId);
  refresh();
  go("/provider/settings", { notice: "Settings saved." });
}

export async function saveLineLink(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/settings", { error: "Only the owner can connect the network box." });
  const current = getProvider(session.providerId);
  if (!current) go("/provider/settings", { error: "This desk was not found." });
  const kind = readText(formData, "line_kind");
  if (kind !== "" && kind !== "mikrotik" && kind !== "radius") {
    go("/provider/settings", { error: "Choose MikroTik, RADIUS, or not connected." });
  }
  if (!kind) {
    run("UPDATE providers SET line_kind = '' WHERE id = ?", session.providerId);
    refresh();
    go("/provider/settings", { notice: "Network box disconnected. Line status on the desk still saves." });
  }
  const host = readText(formData, "line_host");
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) || host.includes("..") || host.startsWith(".") || host.endsWith(".")) {
    go("/provider/settings", { error: "Enter the router or database address." });
  }
  const portRaw = readText(formData, "line_port");
  const port = portRaw ? Number(portRaw) : kind === "mikrotik" ? 8728 : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535) go("/provider/settings", { error: "Enter a port between 1 and 65535." });
  const user = readText(formData, "line_user");
  if (user.length < 1 || user.length > 64) go("/provider/settings", { error: "Enter the login name for the network box." });
  const secretInput = String(formData.get("line_secret") ?? "");
  const secret = secretInput || current.line_secret;
  if (!secret) go("/provider/settings", { error: "Enter the password for the network box." });
  if (secret.length > 200) go("/provider/settings", { error: "That password is too long." });
  const database = kind === "radius" ? readText(formData, "line_db") : current.line_db;
  if (kind === "radius" && !/^[A-Za-z0-9_]{1,64}$/.test(database)) {
    go("/provider/settings", { error: "Enter the RADIUS database name using letters, numbers, and underscore." });
  }
  const coaInput = String(formData.get("line_coa") ?? "");
  const coa = kind === "radius" ? coaInput || current.line_coa : current.line_coa;
  if (coa.length > 200) go("/provider/settings", { error: "That disconnect secret is too long." });
  run(
    `UPDATE providers
     SET line_kind = ?, line_host = ?, line_port = ?, line_user = ?, line_secret = ?, line_db = ?, line_coa = ?
     WHERE id = ?`,
    kind,
    host,
    port,
    user,
    secret,
    database,
    coa,
    session.providerId,
  );
  refresh();
  go("/provider/settings", {
    notice:
      kind === "mikrotik"
        ? "MikroTik saved. Active, Paused, and Disconnect on a subscriber use this router when a PPPoE username is filled in."
        : "RADIUS saved. Active allows the next login. Paused and Disconnect block it.",
  });
}

export async function saveReminderMessages(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/settings", { error: "Only the owner can edit reminder messages." });
  const soonTitle = readText(formData, "soon_title");
  const soonBody = readText(formData, "soon_body");
  const dueTitle = readText(formData, "due_title");
  const dueBody = readText(formData, "due_body");
  if (soonTitle.length < 3 || dueTitle.length < 3) go("/provider/settings", { error: "Each reminder needs a title." });
  if (soonBody.length < 3 || dueBody.length < 3) go("/provider/settings", { error: "Each reminder needs a message." });
  if ([soonTitle, dueTitle].some((value) => value.length > 80) || [soonBody, dueBody].some((value) => value.length > 400)) {
    go("/provider/settings", { error: "Keep each title under 80 characters and each message under 400." });
  }
  run(
    `UPDATE providers
     SET reminder_soon_title = ?, reminder_soon_body = ?, reminder_due_title = ?, reminder_due_body = ?
     WHERE id = ?`,
    soonTitle,
    soonBody,
    dueTitle,
    dueBody,
    session.providerId,
  );
  refresh();
  go("/provider/settings", { notice: "Reminder messages saved. A line that is already paid does not receive one." });
}

const DESK_PAY_METHODS = ["credit_card", "debit_card", "upi", "net_banking", "auto_pay"] as const;
const DESK_PAY_VIA = ["credit_card", "debit_card", "upi"] as const;

function looksLikeFullCard(value: string) {
  return /^\d{13,19}$/.test(value.replace(/\s+/g, ""));
}

export async function saveDeskPayment(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/provider/settings", { error: "Only the owner can save a payment method." });
  const method = readText(formData, "method");
  if (!DESK_PAY_METHODS.includes(method as (typeof DESK_PAY_METHODS)[number])) {
    go("/provider/settings", { error: "Choose a payment option." });
  }
  const viaInput = readText(formData, "via");
  const via = method === "auto_pay" ? viaInput : "";
  if (method === "auto_pay" && !DESK_PAY_VIA.includes(via as (typeof DESK_PAY_VIA)[number])) {
    go("/provider/settings", { error: "Choose credit card, debit card, or UPI for auto-pay." });
  }
  const instrument = method === "auto_pay" ? via : method;
  const holder = readText(formData, "holder");
  const last4 = readText(formData, "last4").replace(/\s+/g, "");
  const expiry = readText(formData, "expiry");
  const upi = readText(formData, "upi").replace(/\s+/g, "");
  const bank = readText(formData, "bank");
  if ([holder, last4, expiry, upi, bank].some(looksLikeFullCard)) {
    go("/provider/settings", { error: "Enter only the last 4 digits. The full card number is not saved." });
  }
  let detail = "";
  let savedHolder = "";
  let savedExpiry = "";
  if (instrument === "credit_card" || instrument === "debit_card") {
    if (!/^\d{4}$/.test(last4)) go("/provider/settings", { error: "Enter the last 4 digits of the card." });
    if (expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      go("/provider/settings", { error: "Enter the expiry as MM/YY, or leave it blank." });
    }
    if (holder && holder.length < 2) go("/provider/settings", { error: "Enter the name on the card." });
    if (holder.length > 60) go("/provider/settings", { error: "Keep the name on the card under 60 characters." });
    detail = last4;
    savedHolder = holder;
    savedExpiry = expiry;
  } else if (instrument === "upi") {
    if (!/^[a-zA-Z0-9._-]{2,40}@[a-zA-Z]{2,40}$/.test(upi)) {
      go("/provider/settings", { error: "Enter a UPI ID such as name@okbank." });
    }
    detail = upi;
  } else {
    if (bank.length < 2 || bank.length > 60) go("/provider/settings", { error: "Enter the bank name." });
    if (holder.length > 60) go("/provider/settings", { error: "Keep the account name under 60 characters." });
    detail = bank;
    savedHolder = holder;
  }
  run(
    "UPDATE providers SET pay_method = ?, pay_via = ?, pay_holder = ?, pay_detail = ?, pay_expiry = ? WHERE id = ?",
    method,
    via,
    savedHolder,
    detail,
    savedExpiry,
    session.providerId,
  );
  refresh();
  go("/provider/settings", { notice: "Payment preference saved. Nothing was charged." });
}

export async function changeDeskPassword(formData: FormData) {
  const session = await requireRole("admin");
  const currentPassword = String(formData.get("current_password") ?? "");
  const nextPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const user = one<{ password_hash: string; is_owner: number }>("SELECT password_hash, is_owner FROM users WHERE id = ?", session.uid);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    go("/provider/settings", { error: "The current password does not match." });
  }
  if (nextPassword.length < 6) go("/provider/settings", { error: "Use at least 6 characters for the new password." });
  if (nextPassword !== confirm) go("/provider/settings", { error: "The new password and confirmation do not match." });
  run(
    "UPDATE users SET password_hash = ?, login_password = ? WHERE id = ?",
    hashPassword(nextPassword),
    user.is_owner ? "" : nextPassword,
    session.uid,
  );
  refresh();
  go("/provider/settings", { notice: "Password updated." });
}

export async function saveOperatorSettings(formData: FormData) {
  const session = await requireOperator();
  const name = readText(formData, "name");
  const theme = readTheme(readText(formData, "theme"));
  if (name.length < 2) go("/zignal/settings", { error: "Enter your name." });
  if (!theme) go("/zignal/settings", { error: "Choose light or dark." });
  run("UPDATE platform_admins SET name = ?, theme = ? WHERE id = ?", name, theme, session.uid);
  refresh();
  go("/zignal/settings", { notice: "Settings saved." });
}

export async function changeOperatorPassword(formData: FormData) {
  const session = await requireOperator();
  const currentPassword = String(formData.get("current_password") ?? "");
  const nextPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const user = one<{ password_hash: string }>("SELECT password_hash FROM platform_admins WHERE id = ?", session.uid);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    go("/zignal/settings", { error: "The current password does not match." });
  }
  if (nextPassword.length < 6) go("/zignal/settings", { error: "Use at least 6 characters for the new password." });
  if (nextPassword !== confirm) go("/zignal/settings", { error: "The new password and confirmation do not match." });
  run("UPDATE platform_admins SET password_hash = ? WHERE id = ?", hashPassword(nextPassword), session.uid);
  refresh();
  go("/zignal/settings", { notice: "Password updated." });
}
