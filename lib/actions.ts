"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authenticate, clearSession, getSession, requireOperator, requireRole, setSession } from "@/lib/auth";
import { normalizeDate, parsePlanCsv, wholeUnits } from "@/lib/csv";
import crypto from "crypto";
import { execFile } from "node:child_process";
import { getDb, many, one, run } from "@/lib/db";
import { DEMO_CUSTOMER_PASSWORD } from "@/lib/demo";
import {
  allows,
  CATALOG,
  customerLimit,
  isProductPlan,
  limitLabel,
  minimumPlan,
  planFitsBase,
  quotePremium,
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
import { hashPassword, verifyPassword } from "@/lib/password";
import { complaintCode, isComplaintStatus, slaHoursFor } from "@/lib/complaints";
import { isLineStatus, type LineStatus } from "@/lib/line-status";
import {
  billCycleFromImport,
  cycleAmount,
  isBillCycle,
  nextRenewalDate,
  remindersFromImport,
  renewalAfterInstallation,
  type BillCycle,
} from "@/lib/bill-cycle";
import { cleanGstin, gstMode, gstOnTop, isGstin, isIndianState } from "@/lib/tax";
import { collectSubscriberPayment, collectUpgradePayment, markUpgradePaid, type UpgradeOrder } from "@/lib/checkout";
import { syncDeskOverflow } from "@/lib/receipts";
import { postOnboardingMessage } from "@/lib/renewals";
import { readCatalogueWorkbook, type SheetRow } from "@/lib/catalogue-book";
import { blankChargeAmount, invoiceFor, parseChargeTax, readBillSettings, readBillTax, readCharges, readDiscounts, readPlanLines } from "@/lib/charges";
import { readCustomerWorkbook } from "@/lib/customer-book";
import { paymentSource, readPaymentWorkbook } from "@/lib/payment-book";
import { getPlatformProfile, getSubscriber, getSubscriberByUserId, getUsage, listCustomerCharges, listCustomerDiscounts, listCustomerExtraPlans, SUPPORT_PRIORITIES, SUPPORT_TOPICS } from "@/lib/queries";

function go(path: string, params?: Record<string, string>): never {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  redirect(`${path}${query}`);
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
  await setSession(user.id, user.kind);
  if (user.kind === "operator") redirect("/zignal");
  redirect(user.role === "admin" ? "/provider" : "/subscriber");
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
    },
  };
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

export async function lookupPincode(pin: string) {
  await requireRole("admin");
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
  const input = parsed.value;
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

  const db = getDb();
  let customerId = 0;
  db.exec("BEGIN");
  try {
    const user = run(
      "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'customer', ?, ?, ?, 0)",
      input.email,
      hashPassword(DEMO_CUSTOMER_PASSWORD),
      input.name,
      nowStamp(),
      session.providerId,
    );
    const customer = run(
      `INSERT INTO customers
        (user_id, mobile, address, city, pincode, state, country, status, plan_id, renew_date, installation_date, notes, area, bill_cycle, reminders,
         plan_frequency, plan_tax_included, plan_tax_percent, invoice_tax_included, invoice_tax_percent, plan_amount, plan_cycle, plan_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    postOnboardingMessage(customerId, session.providerId, DEMO_CUSTOMER_PASSWORD);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  syncDeskOverflow(session.providerId);
  refresh();
  go(`/provider/subscriber/${customerId}`, {
    notice: `Subscriber added. Portal password is ${DEMO_CUSTOMER_PASSWORD}. A welcome message with the plan, next payment date, and login is on their portal.`,
  });
}

export async function updateSubscriber(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  const parsed = readSubscriberInput(formData, session.providerId, session.productPlan);
  if (!parsed.ok) go(`/provider/subscriber/${id}`, { error: parsed.error });
  const input = parsed.value;

  const clash = one<{ id: number }>("SELECT id FROM users WHERE email = ? AND id != ?", input.email, current.user_id);
  if (clash) go(`/provider/subscriber/${id}`, { error: "That email is already used for a login." });

  const db = getDb();
  db.exec("BEGIN");
  try {
    run("UPDATE users SET name = ?, email = ? WHERE id = ?", input.name, input.email, current.user_id);
    run(
      `UPDATE customers
       SET mobile = ?, address = ?, city = ?, pincode = ?, state = ?, country = ?, status = ?, plan_id = ?, renew_date = ?, installation_date = ?, notes = ?, area = ?, bill_cycle = ?, reminders = ?, plan_amount = ?, plan_label = ?
       WHERE id = ?`,
      input.mobile,
      input.address,
      input.city,
      input.pincode,
      input.state,
      input.country,
      input.status,
      input.planId,
      input.renewDate,
      input.installationDate,
      input.notes,
      allows(session.productPlan, "areas") ? input.area : current.area,
      input.billCycle,
      input.reminders,
      input.planId === current.plan_id ? current.plan_amount : 0,
      input.planId === current.plan_id ? current.plan_label : "",
      id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go(`/provider/subscriber/${id}`, { notice: "Subscriber details saved." });
}

export async function resetPortalPassword(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/provider/subscriber", { error: "That subscriber was not found." });
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(DEMO_CUSTOMER_PASSWORD), current.user_id);
  refresh();
  go(`/provider/subscriber/${id}`, { notice: `Portal password reset to ${DEMO_CUSTOMER_PASSWORD}.` });
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
  const periodEnd = kind === "full" ? nextRenewalDate(current.renew_date, today, current.bill_cycle) : current.renew_date;
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
      run("UPDATE customers SET renew_date = ?, status = 'active' WHERE id = ?", periodEnd, id);
      run("UPDATE customer_charges SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", id);
      run("UPDATE customer_discounts SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", id);
      if (current.plan_frequency === "once") run("UPDATE customers SET plan_billed = 1 WHERE id = ?", id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go(`/provider/receipt/income/${paymentId}`);
}

function billingGo(id: number, params?: Record<string, string>): never {
  go(`/provider/subscriber/${id}`, { tab: "billing", ...params });
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

function readServiceDates(formData: FormData, mode: "both" | "activation") {
  const activated = readText(formData, "activated_on");
  const renews = mode === "both" ? readText(formData, "renews_on") : "";
  if (!isDate(activated)) return { ok: false as const, error: "Enter the activation date." };
  if (mode === "both" && !isDate(renews)) return { ok: false as const, error: "Enter the renewal date." };
  if (mode === "both" && renews < activated) return { ok: false as const, error: "The renewal date is on or after the activation date." };
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
  const dates = readServiceDates(formData, "both");
  if (!isBillCycle(cycle)) billingGo(current.id, { line: "plan", error: "Choose how often this internet plan is billed." });
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
  const dates = readServiceDates(formData, "both");
  const back = extraId ? `extra-${extraId}` : "add-plan";
  if (extraId && !one("SELECT id FROM customer_extra_plans WHERE id = ? AND customer_id = ?", extraId, current.id)) {
    billingGo(current.id, { error: "That internet plan was not found on this account." });
  }
  if (!isBillCycle(cycle)) billingGo(current.id, { line: back, error: "Choose how often this internet plan is billed." });
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

export async function deleteExtraPlan(formData: FormData) {
  const session = await requireRole("admin");
  const current = billingCustomer(session.providerId, formData);
  const extraId = Number(formData.get("extra_id"));
  run("DELETE FROM customer_extra_plans WHERE id = ? AND customer_id = ?", extraId, current.id);
  refresh();
  billingGo(current.id, { notice: "Internet plan removed." });
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
    billingGo(current.id, { error: "That payment was not found on this account." });
  }
  if (!Number.isInteger(amount) || amount <= 0) billingGo(current.id, { line: back, error: "Enter the payment in whole rupees." });
  if (!methods.includes(method)) billingGo(current.id, { line: back, error: "Choose a payment method." });
  if (note.length > 200) billingGo(current.id, { line: back, error: "Keep the payment note short." });
  run("UPDATE payments SET amount = ?, method = ?, note = ?, receipt_snapshot = '' WHERE id = ? AND customer_id = ?", amount, method, note, paymentId, current.id);
  refresh();
  billingGo(current.id, { notice: "Payment updated. The renewal date is unchanged." });
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

  run(
    "INSERT INTO reminders (customer_id, title, body, created_at, channel) VALUES (?, ?, ?, ?, ?)",
    id,
    title,
    body,
    nowStamp(),
    channel,
  );
  refresh();
  const delivery =
    channel === "portal"
      ? "Reminder is on the subscriber portal."
      : `Reminder is on the subscriber portal, marked as ${channel}. Inbox and phone delivery needs a mail or SMS account connected later.`;
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

  const method = readText(formData, "method");
  const detail = readText(formData, "detail");
  if (!["UPI", "Card", "Net banking"].includes(method)) {
    go("/subscriber/pay", { error: "Choose how you want to pay." });
  }
  if (detail.length > 80) go("/subscriber/pay", { error: "Keep the payer reference short." });

  const today = todayISO();
  const periodEnd = nextRenewalDate(current.renew_date, today, current.bill_cycle);
  const periodStart = current.renew_date > today ? current.renew_date : today;
  const reference = makeRef();
  const note = detail ? `Payer reference: ${detail}` : "Paid from the subscriber portal";
  const charges = listCustomerCharges(current.id);
  const discounts = listCustomerDiscounts(current.id);
  const extraPlans = listCustomerExtraPlans(current.id);
  const built = invoiceFor(current, charges, {
    discounts,
    extraPlans,
  });
  const due = built.due;
  if (due <= 0) go("/subscriber/pay", { error: "Nothing is due on this line." });
  const lineItems = JSON.stringify(built.lines);

  const result = collectSubscriberPayment(current.id, { method, detail, amount: due });
  if (!result.ok) go("/subscriber/pay", { notice: "gateway" });

  const db = getDb();
  let paymentId = 0;
  db.exec("BEGIN");
  try {
    const inserted = run(
      `INSERT INTO payments
        (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind, line_items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'full', ?)`,
      current.id,
      due,
      method,
      reference,
      nowStamp(),
      periodStart,
      periodEnd,
      note,
      lineItems,
    );
    paymentId = Number(inserted.lastInsertRowid);
    run("UPDATE customers SET renew_date = ?, status = 'active' WHERE id = ?", periodEnd, current.id);
    run("UPDATE customer_charges SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", current.id);
    run("UPDATE customer_discounts SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", current.id);
    if (current.plan_frequency === "once") run("UPDATE customers SET plan_billed = 1 WHERE id = ?", current.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go(`/subscriber/receipt/${paymentId}`);
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

export async function registerProvider(formData: FormData) {
  const isp = readText(formData, "isp_name");
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phone = readText(formData, "support_phone").replace(/\s+/g, "");
  const plan = readText(formData, "product_plan");
  const base = Number(readText(formData, "subscriber_base"));
  if (isp.length < 2) go("/signup", { error: "Enter your ISP name." });
  if (name.length < 2) go("/signup", { error: "Enter your name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) go("/signup", { error: "Enter a valid email." });
  if (password.length < 6) go("/signup", { error: "Use at least 6 characters for the password." });
  if (phone && !/^[6-9]\d{9}$/.test(phone)) go("/signup", { error: "Enter a 10-digit support number, or leave it blank." });
  if (!Number.isInteger(base) || base < 1 || base > 1_000_000) {
    go("/signup", { error: "Enter how many subscribers you have, as a whole number." });
  }
  if (!isProductPlan(plan)) go("/signup", { error: "Choose Pro, Ultra, or a Premium tier." });
  if (base > CATALOG.premium_30000.customers) {
    go("/signup", { error: `The largest desk is ${CATALOG.premium_30000.label} (${limitLabel(CATALOG.premium_30000.customers)} subscribers).` });
  }
  if (!planFitsBase(plan, base)) {
    const fit = CATALOG[minimumPlan(base)];
    go("/signup", {
      error: `${CATALOG[plan].label} holds ${limitLabel(CATALOG[plan].customers)} subscribers. A book of ${base} needs ${fit.label}.`,
    });
  }
  if (one("SELECT id FROM users WHERE email = ?", email)) go("/signup", { error: "That email is already used for a login." });

  const trialEnds = addDays(todayISO(), CATALOG[plan].trialDays);
  const db = getDb();
  let userId = 0;
  db.exec("BEGIN");
  try {
    const provider = run(
      `INSERT INTO providers
        (name, product_plan, support_phone, logo_letter, created_at, subscriber_base, trial_ends)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      isp,
      plan,
      phone,
      isp.trim().slice(0, 1).toUpperCase(),
      nowStamp(),
      base,
      trialEnds,
    );
    const user = run(
      "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'admin', ?, ?, ?, 1)",
      email,
      hashPassword(password),
      name,
      nowStamp(),
      Number(provider.lastInsertRowid),
    );
    userId = Number(user.lastInsertRowid);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  await setSession(userId);
  const chosen = CATALOG[plan];
  redirect(
    `/provider/upgrade?notice=${encodeURIComponent(
      `${chosen.label} trial runs until ${formatDate(trialEnds)}. You registered ${base} subscribers and can add up to ${limitLabel(chosen.customers)} during the trial.`,
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
  const passwordHash = hashPassword(DEMO_CUSTOMER_PASSWORD);
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
      const notes = (row.cells.notes ?? "").trim();
      const area = (row.cells.area ?? "").trim();
      const billCycle = billCycleFromImport(row.cells.billCycle ?? "");
      const reminders = remindersFromImport(row.cells.reminders ?? "");
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
        if (billCycle === "invalid") fail(row.line, `Account, row ${row.line}: Bill cycle must be weekly, bi-weekly, monthly, quarterly, bi-annual, or annual.`);
        if (reminders === "invalid") fail(row.line, `Account, row ${row.line}: Reminders must be yes or no.`);
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

      if (!main || !invoiceTax.ok || billCycle === "invalid" || reminders === "invalid") continue;

      const user = run(
        "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'customer', ?, ?, ?, 0)",
        email,
        passwordHash,
        name,
        nowStamp(),
        session.providerId,
      );
      const customer = run(
        `INSERT INTO customers
          (user_id, mobile, address, city, status, plan_id, renew_date, installation_date, notes, area, bill_cycle, reminders,
           plan_frequency, plan_tax_included, plan_tax_percent, invoice_tax_included, invoice_tax_percent, plan_amount, plan_cycle, plan_label)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, 'recurring', ?, ?, ?, ?, ?, ?, '')`,
        Number(user.lastInsertRowid),
        mobile,
        address,
        city,
        main.planId,
        renewDate,
        installationDate,
        notes.slice(0, 500),
        allows(session.productPlan, "areas") ? area.slice(0, 80) : "",
        billCycle,
        reminders ? 1 : 0,
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
      postOnboardingMessage(Number(customer.lastInsertRowid), session.providerId, DEMO_CUSTOMER_PASSWORD);
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
  if (imported > 0) syncDeskOverflow(session.providerId);
  refresh();
  go("/provider/import", {
    notice: `${[`Imported ${imported}`, ...(updated ? [`Updated ${updated}`] : []), `Skipped ${issues.length}`].join(". ")}. Portal password for new logins is ${DEMO_CUSTOMER_PASSWORD}. Each new subscriber has a welcome message on the portal.`,
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
      const periodEnd = kind === "full" ? nextRenewalDate(current.renew_date, paidOn, current.bill_cycle) : current.renew_date;
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
        run("UPDATE customers SET renew_date = ?, status = 'active' WHERE id = ?", periodEnd, customerId);
        run("UPDATE customer_charges SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", customerId);
        run("UPDATE customer_discounts SET billed = 1 WHERE customer_id = ? AND frequency = 'once' AND billed = 0", customerId);
        if (current.plan_frequency === "once") run("UPDATE customers SET plan_billed = 1 WHERE id = ?", customerId);
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

  refresh();
  go("/provider/payments", {
    notice: `Recorded ${imported}. Skipped ${issues.length}.`,
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
  if (nextPlan === usage.plan && subscriberBase === usage.subscriberBase) {
    go("/provider/upgrade", { error: "This desk is already on that plan." });
  }
  const provider = usage.provider;
  const platform = getPlatformProfile();
  const amount = CATALOG[nextPlan].price;
  const taxed = platform.gstin ? gstOnTop(amount) : { tax: 0, total: amount };
  const mode = platform.gstin ? gstMode(platform.state, provider?.state ?? "") : "none";
  const label = requested === "premium" ? "Premium" : CATALOG[nextPlan].label;
  const inserted = run(
    `INSERT INTO upgrade_orders (
      provider_id, product_plan, subscriber_base, plan_label, plan_amount, tax, total, gst_mode, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    session.providerId,
    nextPlan,
    subscriberBase,
    label,
    amount,
    taxed.tax,
    taxed.total,
    mode,
    nowStamp(),
  );
  redirect(`/provider/upgrade/pay/${Number(inserted.lastInsertRowid)}`);
}

export async function payUpgrade(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(readText(formData, "order_id"));
  const order = one<UpgradeOrder>("SELECT * FROM upgrade_orders WHERE id = ?", id);
  if (!order || order.provider_id !== session.providerId) go("/provider/upgrade", { error: "That payment was not found." });
  if (!session.isOwner) go(`/provider/upgrade/pay/${id}`, { error: "Only the desk owner can pay for a plan." });
  if (order.status === "paid") redirect("/provider/upgrade?notice=Plan%20updated.");
  const method = readText(formData, "method");
  const detail = readText(formData, "detail");
  if (!["UPI", "Card", "Net banking"].includes(method)) {
    go(`/provider/upgrade/pay/${id}/checkout`, { error: "Choose how you want to pay." });
  }
  const result = collectUpgradePayment(order.id, { method, detail });
  if (!result.ok) redirect(`/provider/upgrade/pay/${id}/checkout?notice=gateway`);
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
     VALUES (?, ?, ?, 'new', '', ?, ?, ?)`,
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
     WHERE customer_id = ? AND category = ? AND details = ? AND status != 'resolved'
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
     VALUES (?, ?, ?, 'new', '', ?, ?, ?)`,
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
  if ((status === "assigned" || status === "pending") && !assigneeId) {
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
  const resolvedAt = status === "resolved" ? ticket.resolved_at || now : "";
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

export async function recordDeskPayment(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/");
  const back = session.kind === "operator" ? "/zignal/revenue" : "/provider/revenue";
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
  refresh();
  go(receipt);
}

const SUPPORT_STATUSES = ["open", "in_progress", "resolved"] as const;

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
     VALUES (?, ?, ?, ?, 'open', '', ?, ?, ?, ?)`,
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
  if (ticket.status === "resolved") {
    run("UPDATE support_requests SET status = 'open', resolved_at = '', updated_at = ? WHERE id = ?", stamp, id);
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
  if (!SUPPORT_STATUSES.includes(status as (typeof SUPPORT_STATUSES)[number])) {
    go("/zignal/support", { error: "Choose a status." });
  }
  if (reply.length > 800) go("/zignal/support", { error: "Keep the reply under 800 characters." });
  const ticket = one<{ id: number; resolved_at: string }>("SELECT id, resolved_at FROM support_requests WHERE id = ?", id);
  if (!ticket) go("/zignal/support", { error: "That message was not found." });
  const stamp = nowStamp();
  const resolvedAt = status === "resolved" ? ticket.resolved_at || stamp : "";
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
