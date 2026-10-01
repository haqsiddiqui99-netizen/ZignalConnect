"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authenticate, clearSession, requireRole, setSession } from "@/lib/auth";
import { normalizeDate, parseCustomerCsv } from "@/lib/csv";
import crypto from "crypto";
import { getDb, many, one, run } from "@/lib/db";
import { DEMO_CUSTOMER_PASSWORD } from "@/lib/demo";
import { allows, CATALOG, customerLimit, isProductPlan, staffLimit, type ProductPlan } from "@/lib/entitlements";
import {
  formatDate,
  formatInr,
  isDate,
  makeRef,
  nowStamp,
  renewalAfterPayment,
  todayISO,
} from "@/lib/format";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getSubscriber, getUsage } from "@/lib/queries";

function go(path: string, params?: Record<string, string>): never {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  redirect(`${path}${query}`);
}

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/plans");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/import");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/team");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/complaints");
  revalidatePath("/portal");
  revalidatePath("/portal/pay");
  revalidatePath("/portal/history");
  revalidatePath("/portal/complaints");
}

export async function login(formData: FormData) {
  const email = readText(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = authenticate(email, password);
  if (!user) go("/", { error: "Those credentials do not match an account." });
  await setSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/portal");
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
  planId: number;
  renewDate: string;
  installationDate: string;
  status: "active" | "suspended";
  notes: string;
  area: string;
};

function readSubscriberInput(
  formData: FormData,
  providerId: number,
  plan: ProductPlan,
): { ok: true; value: SubscriberInput } | { ok: false; error: string } {
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const mobile = readText(formData, "mobile").replace(/\s+/g, "");
  const address = readText(formData, "address");
  const city = readText(formData, "city");
  const planId = Number(formData.get("plan_id"));
  const renewDate = readText(formData, "renew_date");
  const installationDate = readText(formData, "installation_date");
  const status = readText(formData, "status");
  const notes = readText(formData, "notes");
  const area = allows(plan, "areas") ? readText(formData, "area") : "";

  if (name.length < 2) return { ok: false, error: "Enter the subscriber's name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email for the portal login." };
  if (!/^[6-9]\d{9}$/.test(mobile)) return { ok: false, error: "Enter a 10-digit mobile number." };
  if (address.length < 4) return { ok: false, error: "Enter the service address." };
  if (city.length < 2) return { ok: false, error: "Enter the city." };
  if (!Number.isInteger(planId) || planId <= 0) return { ok: false, error: "Choose a plan." };
  if (!isDate(renewDate) || !isDate(installationDate)) return { ok: false, error: "Enter both dates." };
  if (status !== "active" && status !== "suspended") return { ok: false, error: "Choose a line status." };
  if (notes.length > 500) return { ok: false, error: "Keep notes under 500 characters." };
  if (area.length > 80) return { ok: false, error: "Keep the area name short." };
  if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", planId, providerId)) {
    return { ok: false, error: "That plan is no longer on the catalogue." };
  }

  return {
    ok: true,
    value: { name, email, mobile, address, city, planId, renewDate, installationDate, status, notes, area },
  };
}

export async function createSubscriber(formData: FormData) {
  const session = await requireRole("admin");
  const usage = getUsage(session.providerId);
  if (usage.customers >= usage.customerCap) {
    go("/admin/customers/new", {
      error: `${usage.catalog.label} holds ${usage.customerCap} customers. Upgrade the desk to add more.`,
    });
  }
  const parsed = readSubscriberInput(formData, session.providerId, session.productPlan);
  if (!parsed.ok) go("/admin/customers/new", { error: parsed.error });
  const input = parsed.value;

  if (one("SELECT id FROM users WHERE email = ?", input.email)) {
    go("/admin/customers/new", { error: "That email is already used for a login." });
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
        (user_id, mobile, address, city, status, plan_id, renew_date, installation_date, notes, area)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Number(user.lastInsertRowid),
      input.mobile,
      input.address,
      input.city,
      input.status,
      input.planId,
      input.renewDate,
      input.installationDate,
      input.notes,
      input.area,
    );
    customerId = Number(customer.lastInsertRowid);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go(`/admin/customers/${customerId}`, {
    notice: `Subscriber added. Portal password is ${DEMO_CUSTOMER_PASSWORD}.`,
  });
}

export async function updateSubscriber(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/admin/customers", { error: "That subscriber was not found." });
  const parsed = readSubscriberInput(formData, session.providerId, session.productPlan);
  if (!parsed.ok) go(`/admin/customers/${id}`, { error: parsed.error });
  const input = parsed.value;

  const clash = one<{ id: number }>("SELECT id FROM users WHERE email = ? AND id != ?", input.email, current.user_id);
  if (clash) go(`/admin/customers/${id}`, { error: "That email is already used for a login." });

  const db = getDb();
  db.exec("BEGIN");
  try {
    run("UPDATE users SET name = ?, email = ? WHERE id = ?", input.name, input.email, current.user_id);
    run(
      `UPDATE customers
       SET mobile = ?, address = ?, city = ?, status = ?, plan_id = ?, renew_date = ?, installation_date = ?, notes = ?, area = ?
       WHERE id = ?`,
      input.mobile,
      input.address,
      input.city,
      input.status,
      input.planId,
      input.renewDate,
      input.installationDate,
      input.notes,
      allows(session.productPlan, "areas") ? input.area : current.area,
      id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go(`/admin/customers/${id}`, { notice: "Subscriber details saved." });
}

export async function resetPortalPassword(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/admin/customers", { error: "That subscriber was not found." });
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(DEMO_CUSTOMER_PASSWORD), current.user_id);
  refresh();
  go(`/admin/customers/${id}`, { notice: `Portal password reset to ${DEMO_CUSTOMER_PASSWORD}.` });
}

export async function recordPayment(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/admin/customers", { error: "That subscriber was not found." });

  const amount = Number(formData.get("amount"));
  const method = readText(formData, "method");
  const note = readText(formData, "note");
  const methods = ["UPI", "Card", "Net banking", "Cash"];
  if (!Number.isInteger(amount) || amount <= 0) {
    go(`/admin/customers/${id}`, { error: "Enter a payment amount in whole rupees." });
  }
  if (!methods.includes(method)) go(`/admin/customers/${id}`, { error: "Choose a payment method." });
  if (note.length > 200) go(`/admin/customers/${id}`, { error: "Keep the payment note short." });

  const kind = amount >= current.price ? "full" : "partial";
  const today = todayISO();
  const periodEnd = kind === "full" ? renewalAfterPayment(current.renew_date, today) : current.renew_date;
  const periodStart = current.renew_date > today ? today : current.renew_date;
  const reference = makeRef();

  const db = getDb();
  db.exec("BEGIN");
  try {
    run(
      `INSERT INTO payments
        (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      amount,
      method,
      reference,
      nowStamp(),
      periodStart,
      periodEnd,
      note || `Recorded by ${session.name}`,
      kind,
    );
    if (kind === "full") {
      run("UPDATE customers SET renew_date = ?, status = 'active' WHERE id = ?", periodEnd, id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  const notice =
    kind === "full"
      ? `Payment ${reference} recorded. Renewal moved to ${formatDate(periodEnd)}.`
      : `Partial payment ${reference} recorded. Renewal stays on ${formatDate(current.renew_date)} until a full plan payment is received.`;
  go(`/admin/customers/${id}`, { notice });
}

export async function sendReminder(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("customer_id"));
  const current = getSubscriber(id, session.providerId);
  if (!current) go("/admin/customers", { error: "That subscriber was not found." });

  const channel = readText(formData, "channel") || "portal";
  if (channel === "email" && !allows(session.productPlan, "emailReminders")) {
    go(`/admin/customers/${id}`, { error: "Email reminders are part of Pro, Ultra, and Premium." });
  }
  if ((channel === "sms" || channel === "whatsapp") && !allows(session.productPlan, "sms")) {
    go(`/admin/customers/${id}`, { error: "SMS and WhatsApp reminders are part of Ultra and Premium." });
  }
  if (!["portal", "email", "sms", "whatsapp"].includes(channel)) {
    go(`/admin/customers/${id}`, { error: "Choose where the reminder should go." });
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
      go(`/admin/customers/${id}`, { error: "A custom reminder needs a title and a message." });
    }
  }
  if (title.length > 80 || body.length > 400) {
    go(`/admin/customers/${id}`, { error: "That reminder is too long." });
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
  go(`/admin/customers/${id}`, { notice: delivery });
}

export async function savePlan(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("plan_id") || 0);
  const name = readText(formData, "name");
  const speed = Number(formData.get("speed_mbps"));
  const price = Number(formData.get("price"));
  const dataCap = readText(formData, "data_cap") || "Unlimited";
  const description = readText(formData, "description");

  if (name.length < 2) go("/admin/plans", { error: "Enter a plan name." });
  if (!Number.isInteger(speed) || speed <= 0) go("/admin/plans", { error: "Enter the speed in Mbps." });
  if (!Number.isInteger(price) || price <= 0) go("/admin/plans", { error: "Enter the monthly price in rupees." });
  if (description.length < 8) go("/admin/plans", { error: "Add a short description of who the plan is for." });

  const clash = one<{ id: number }>(
    "SELECT id FROM plans WHERE provider_id = ? AND name = ? AND id != ?",
    session.providerId,
    name,
    id,
  );
  if (clash) go("/admin/plans", { error: "A plan with that name already exists." });

  if (id) {
    if (!one("SELECT id FROM plans WHERE id = ? AND provider_id = ?", id, session.providerId)) {
      go("/admin/plans", { error: "That plan was not found." });
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
  go("/admin/plans", { notice: id ? "Plan updated." : "Plan added to the catalogue." });
}

export async function payBill(formData: FormData) {
  const session = await requireRole("customer");
  if (!allows(session.productPlan, "onlinePay")) {
    go("/portal/pay", { error: "Online renewal is part of the provider's Ultra or Premium plan. Pay the office for now." });
  }
  const current = getSubscriberByUser(session.uid);
  if (!current) go("/portal", { error: "No service line is linked to this login." });

  const method = readText(formData, "method");
  const detail = readText(formData, "detail");
  if (!["UPI", "Card", "Net banking"].includes(method)) {
    go("/portal/pay", { error: "Choose how you want to pay." });
  }
  if (detail.length > 80) go("/portal/pay", { error: "Keep the payer reference short." });

  const today = todayISO();
  const periodEnd = renewalAfterPayment(current.renew_date, today);
  const reference = makeRef();
  const note = detail ? `Payer reference: ${detail}` : "Paid from the subscriber portal";

  const db = getDb();
  db.exec("BEGIN");
  try {
    run(
      `INSERT INTO payments
        (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'full')`,
      current.id,
      current.price,
      method,
      reference,
      nowStamp(),
      current.renew_date > today ? current.renew_date : today,
      periodEnd,
      note,
    );
    run("UPDATE customers SET renew_date = ?, status = 'active' WHERE id = ?", periodEnd, current.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  refresh();
  go("/portal", {
    notice: `Payment ${reference} recorded for ${formatInr(current.price)}. Your renewal is now ${formatDate(periodEnd)}. No bank was charged — this desk keeps its own ledger.`,
  });
}

function getSubscriberByUser(userId: number) {
  return one<{ id: number; price: number; renew_date: string }>(
    `SELECT c.id, p.price, c.renew_date
     FROM customers c JOIN plans p ON p.id = c.plan_id
     WHERE c.user_id = ?`,
    userId,
  );
}

export async function changePassword(formData: FormData) {
  const session = await requireRole("customer");
  const currentPassword = String(formData.get("current_password") ?? "");
  const nextPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const user = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", session.uid);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    go("/portal", { error: "The current password does not match." });
  }
  if (nextPassword.length < 6) go("/portal", { error: "Use at least 6 characters for the new password." });
  if (nextPassword !== confirm) go("/portal", { error: "The new password and confirmation do not match." });
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(nextPassword), session.uid);
  refresh();
  go("/portal", { notice: "Password updated." });
}

export async function registerProvider(formData: FormData) {
  const isp = readText(formData, "isp_name");
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phone = readText(formData, "support_phone").replace(/\s+/g, "");
  if (isp.length < 2) go("/signup", { error: "Enter your ISP name." });
  if (name.length < 2) go("/signup", { error: "Enter your name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) go("/signup", { error: "Enter a valid email." });
  if (password.length < 6) go("/signup", { error: "Use at least 6 characters for the password." });
  if (phone && !/^[6-9]\d{9}$/.test(phone)) go("/signup", { error: "Enter a 10-digit support number, or leave it blank." });
  if (one("SELECT id FROM users WHERE email = ?", email)) go("/signup", { error: "That email is already used for a login." });

  const db = getDb();
  let userId = 0;
  db.exec("BEGIN");
  try {
    const provider = run(
      "INSERT INTO providers (name, product_plan, support_phone, logo_letter, created_at) VALUES (?, 'free', ?, ?, ?)",
      isp,
      phone,
      isp.trim().slice(0, 1).toUpperCase(),
      nowStamp(),
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
  redirect("/admin/billing?notice=Your desk is on Free, with room for 10 customers.");
}

export async function importCustomers(formData: FormData) {
  const session = await requireRole("admin");
  const parsed = parseCustomerCsv(readText(formData, "csv"));
  if (parsed.error) go("/admin/import", { error: parsed.error });
  if (parsed.rows.length === 0) go("/admin/import", { error: "There are no customer rows in that file." });

  const usage = getUsage(session.providerId);
  const plans = many<{ id: number; name: string }>("SELECT id, name FROM plans WHERE provider_id = ?", session.providerId);
  const planByName = new Map(plans.map((plan) => [plan.name.toLowerCase(), plan.id]));
  const seen = new Set<string>();
  let slots = usage.customerSlots;
  const issues: { line: number; message: string }[] = [];
  let imported = 0;
  const today = todayISO();
  const passwordHash = hashPassword(DEMO_CUSTOMER_PASSWORD);
  const db = getDb();
  let batchId = 0;

  db.exec("BEGIN");
  try {
    for (const row of parsed.rows) {
      const renewDate = normalizeDate(row.renewDate);
      const installationDate = row.installationDate ? normalizeDate(row.installationDate) : today;
      const planId = planByName.get(row.plan.toLowerCase());
      let message = "";
      if (row.name.length < 2) message = "Name is missing.";
      else if (!/^\S+@\S+\.\S+$/.test(row.email)) message = "Email is not valid.";
      else if (!/^[6-9]\d{9}$/.test(row.mobile)) message = "Mobile must be a 10-digit number.";
      else if (row.address.length < 4 || row.city.length < 2) message = "Address and city are required.";
      else if (!planId) message = `No catalogue plan named "${row.plan}".`;
      else if (!renewDate || !installationDate) message = "Dates must be YYYY-MM-DD or DD/MM/YYYY.";
      else if (seen.has(row.email) || one("SELECT id FROM users WHERE email = ?", row.email)) message = "That email is already used.";
      else if (slots <= 0) {
        message = Number.isFinite(usage.customerCap)
          ? `${usage.catalog.label} allows ${usage.customerCap} customers. Upgrade to import the rest.`
          : "No customer slots left.";
      }
      if (message) {
        issues.push({ line: row.line, message });
        continue;
      }
      const user = run(
        "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'customer', ?, ?, ?, 0)",
        row.email,
        passwordHash,
        row.name,
        nowStamp(),
        session.providerId,
      );
      run(
        `INSERT INTO customers
          (user_id, mobile, address, city, status, plan_id, renew_date, installation_date, notes, area)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Number(user.lastInsertRowid),
        row.mobile,
        row.address,
        row.city,
        row.status,
        planId as number,
        renewDate as string,
        installationDate as string,
        row.notes.slice(0, 500),
        allows(session.productPlan, "areas") ? row.area.slice(0, 80) : "",
      );
      seen.add(row.email);
      imported += 1;
      slots -= 1;
    }
    const batch = run(
      "INSERT INTO import_batches (provider_id, created_at, imported, skipped) VALUES (?, ?, ?, ?)",
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
  go("/admin/import", {
    notice: `Imported ${imported}. Skipped ${issues.length}. Portal password for new logins is ${DEMO_CUSTOMER_PASSWORD}.`,
    batch: String(batchId),
  });
}

export async function inviteStaff(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/admin/team", { error: "Only the desk owner can add staff." });
  const usage = getUsage(session.providerId);
  if (usage.staff >= usage.staffCap) {
    go("/admin/team", { error: `${usage.catalog.label} includes ${usage.staffCap} staff login. Upgrade to add another.` });
  }
  const name = readText(formData, "name");
  const email = readText(formData, "email").toLowerCase();
  const mobile = readText(formData, "mobile").replace(/\s+/g, "");
  if (name.length < 2) go("/admin/team", { error: "Enter the staff member's name." });
  if (!/^[6-9]\d{9}$/.test(mobile)) go("/admin/team", { error: "Enter a 10-digit mobile number." });
  if (!/^\S+@\S+\.\S+$/.test(email)) go("/admin/team", { error: "Enter a valid email." });
  if (one("SELECT id FROM users WHERE email = ?", email)) go("/admin/team", { error: "That email is already used for a login." });
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
  go("/admin/team", { notice: `${name} is on the team list, with email, password, and mobile saved on this page.` });
}

export async function reissueStaffPassword(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/admin/team", { error: "Only the desk owner can set a staff password." });
  const id = Number(formData.get("staff_id"));
  const person = one<{ id: number; name: string; is_owner: number }>(
    "SELECT id, name, is_owner FROM users WHERE id = ? AND provider_id = ? AND role = 'admin'",
    id,
    session.providerId,
  );
  if (!person || person.is_owner) go("/admin/team", { error: "That staff login was not found." });
  const password = crypto.randomBytes(4).toString("hex");
  run(
    "UPDATE users SET password_hash = ?, login_password = ? WHERE id = ?",
    hashPassword(password),
    password,
    person.id,
  );
  refresh();
  go("/admin/team", { notice: `A new password for ${person.name} is saved on this page.` });
}

export async function changeProductPlan(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/admin/billing", { error: "Only the desk owner can change the plan." });
  const nextPlan = readText(formData, "product_plan");
  if (!isProductPlan(nextPlan)) go("/admin/billing", { error: "Choose Free, Pro, Ultra, or Premium." });
  const usage = getUsage(session.providerId);
  const nextCustomers = customerLimit(nextPlan);
  const nextStaff = staffLimit(nextPlan);
  if (usage.customers > nextCustomers) {
    go("/admin/billing", {
      error: `${CATALOG[nextPlan].label} holds ${nextCustomers} customers. This desk has ${usage.customers}.`,
    });
  }
  if (usage.staff > nextStaff) {
    go("/admin/billing", {
      error: `${CATALOG[nextPlan].label} holds ${nextStaff} staff logins. This desk has ${usage.staff}.`,
    });
  }
  run("UPDATE providers SET product_plan = ? WHERE id = ?", nextPlan, session.providerId);
  refresh();
  go("/admin/billing", { notice: `This desk is now on ${CATALOG[nextPlan].label}.` });
}

const COMPLAINT_CATEGORIES = ["no_internet", "slow", "drops", "other"] as const;
const COMPLAINT_STATUSES = ["open", "in_progress", "resolved"] as const;

export async function raiseComplaint(formData: FormData) {
  const session = await requireRole("customer");
  const current = getSubscriberByUser(session.uid);
  if (!current) go("/portal/complaints", { error: "No service line is linked to this login." });

  const category = readText(formData, "category");
  const details = readText(formData, "details");
  if (!COMPLAINT_CATEGORIES.includes(category as (typeof COMPLAINT_CATEGORIES)[number])) {
    go("/portal/complaints", { error: "Choose the kind of problem." });
  }
  if (details.length < 8) go("/portal/complaints", { error: "Describe what is happening, in a sentence or two." });
  if (details.length > 500) go("/portal/complaints", { error: "Keep the complaint under 500 characters." });

  const stamp = nowStamp();
  run(
    `INSERT INTO complaints (customer_id, category, details, status, provider_note, created_at, updated_at)
     VALUES (?, ?, ?, 'open', '', ?, ?)`,
    current.id,
    category,
    details,
    stamp,
    stamp,
  );
  refresh();
  go("/portal/complaints", { notice: "Complaint sent to your provider. You can follow it on this page." });
}

export async function updateComplaint(formData: FormData) {
  const session = await requireRole("admin");
  const id = Number(formData.get("complaint_id"));
  const status = readText(formData, "status");
  const note = readText(formData, "provider_note");
  if (!COMPLAINT_STATUSES.includes(status as (typeof COMPLAINT_STATUSES)[number])) {
    go("/admin/complaints", { error: "Choose a status." });
  }
  if (note.length > 400) go("/admin/complaints", { error: "Keep the note under 400 characters." });
  const ticket = one<{ id: number }>(
    `SELECT k.id
     FROM complaints k
     JOIN customers c ON c.id = k.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE k.id = ? AND u.provider_id = ?`,
    id,
    session.providerId,
  );
  if (!ticket) go("/admin/complaints", { error: "That complaint was not found." });
  run(
    "UPDATE complaints SET status = ?, provider_note = ?, updated_at = ? WHERE id = ?",
    status,
    note,
    nowStamp(),
    id,
  );
  refresh();
  go("/admin/complaints", { notice: "Complaint updated." });
}

export async function saveBrand(formData: FormData) {
  const session = await requireRole("admin");
  if (!session.isOwner) go("/admin/billing", { error: "Only the desk owner can change the ISP name." });
  const name = readText(formData, "isp_name");
  const phone = readText(formData, "support_phone").replace(/\s+/g, "");
  const logo = readText(formData, "logo_letter").slice(0, 2).toUpperCase();
  if (name.length < 2) go("/admin/billing", { error: "Enter your ISP name." });
  if (phone && !/^[6-9]\d{9}$/.test(phone)) go("/admin/billing", { error: "Enter a 10-digit support number, or leave it blank." });
  const currentLogo = one<{ logo_letter: string }>("SELECT logo_letter FROM providers WHERE id = ?", session.providerId);
  run(
    "UPDATE providers SET name = ?, support_phone = ?, logo_letter = ? WHERE id = ?",
    name,
    phone,
    allows(session.productPlan, "logo") ? logo : (currentLogo?.logo_letter ?? ""),
    session.providerId,
  );
  refresh();
  go("/admin/billing", { notice: "ISP details saved." });
}
