import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { DEMO_ADMIN, DEMO_OPERATOR } from "@/lib/demo";
import { addDays, addMonths, nowStamp, todayISO } from "@/lib/format";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ZIGNAL_ADMIN_EMAIL, ZIGNAL_ADMIN_NAME, ZIGNAL_ADMIN_PASSWORD_HASH } from "@/lib/zignal-admin";

const SCHEMA = 7;
const globalForDb = globalThis as unknown as { lumenDb?: DatabaseSync; schema?: number };

function openDatabase() {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "lumen.db"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 3000");
  migrate(db);
  seed(db);
  return db;
}

export function getDb() {
  if (!globalForDb.lumenDb) globalForDb.lumenDb = openDatabase();
  if (globalForDb.schema !== SCHEMA) {
    migrate(globalForDb.lumenDb);
    globalForDb.schema = SCHEMA;
  }
  const names = columnNames(globalForDb.lumenDb, "users");
  if (!names.has("mobile")) {
    globalForDb.lumenDb.exec("ALTER TABLE users ADD COLUMN mobile TEXT NOT NULL DEFAULT ''");
  }
  if (!names.has("login_password")) {
    globalForDb.lumenDb.exec("ALTER TABLE users ADD COLUMN login_password TEXT NOT NULL DEFAULT ''");
  }
  if (!names.has("theme")) {
    globalForDb.lumenDb.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
  }
  const customerColumns = columnNames(globalForDb.lumenDb, "customers");
  if (customerColumns.size > 0 && !customerColumns.has("bill_cycle")) {
    globalForDb.lumenDb.exec("ALTER TABLE customers ADD COLUMN bill_cycle TEXT NOT NULL DEFAULT 'monthly'");
  }
  if (customerColumns.size > 0 && !customerColumns.has("reminders")) {
    globalForDb.lumenDb.exec("ALTER TABLE customers ADD COLUMN reminders INTEGER NOT NULL DEFAULT 1");
  }
  if (customerColumns.size > 0 && !customerColumns.has("pincode")) {
    globalForDb.lumenDb.exec("ALTER TABLE customers ADD COLUMN pincode TEXT NOT NULL DEFAULT ''");
  }
  if (customerColumns.size > 0 && !customerColumns.has("state")) {
    globalForDb.lumenDb.exec("ALTER TABLE customers ADD COLUMN state TEXT NOT NULL DEFAULT ''");
  }
  if (customerColumns.size > 0 && !customerColumns.has("country")) {
    globalForDb.lumenDb.exec("ALTER TABLE customers ADD COLUMN country TEXT NOT NULL DEFAULT ''");
  }
  if (customerColumns.size > 0 && !customerColumns.has("password_via")) {
    globalForDb.lumenDb.exec("ALTER TABLE customers ADD COLUMN password_via TEXT NOT NULL DEFAULT 'email'");
  }
  ensureCustomerTaxColumns(globalForDb.lumenDb);
  ensurePlatformAdmin(globalForDb.lumenDb);
  retirePublishedDemoLogins(globalForDb.lumenDb);
  const operatorColumns = columnNames(globalForDb.lumenDb, "platform_admins");
  if (!operatorColumns.has("theme")) {
    globalForDb.lumenDb.exec("ALTER TABLE platform_admins ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
  }
  globalForDb.lumenDb.exec(`
    CREATE TABLE IF NOT EXISTS platform_fee_months (
      month TEXT PRIMARY KEY,
      booked INTEGER NOT NULL,
      providers INTEGER NOT NULL
    );
  `);
  ensureReceiptSchema(globalForDb.lumenDb);
  ensureComplaintDesk(globalForDb.lumenDb);
  ensureComplaintOutcomes(globalForDb.lumenDb);
  seedDemoComplaints(globalForDb.lumenDb);
  globalForDb.lumenDb.exec(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mobile TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('new', 'in_progress', 'closed', 'cancelled', 'duplicate')),
      reply TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const supportColumns = columnNames(globalForDb.lumenDb, "support_requests");
  if (supportColumns.size > 0 && !supportColumns.has("resolved_at")) {
    globalForDb.lumenDb.exec("ALTER TABLE support_requests ADD COLUMN resolved_at TEXT NOT NULL DEFAULT ''");
    globalForDb.lumenDb.exec("UPDATE support_requests SET resolved_at = updated_at WHERE status = 'resolved' AND resolved_at = ''");
  }
  if (supportColumns.size > 0 && !supportColumns.has("priority")) {
    globalForDb.lumenDb.exec("ALTER TABLE support_requests ADD COLUMN priority TEXT NOT NULL DEFAULT ''");
  }
  if (supportColumns.size > 0 && !supportColumns.has("topic")) {
    globalForDb.lumenDb.exec("ALTER TABLE support_requests ADD COLUMN topic TEXT NOT NULL DEFAULT ''");
  }
  ensureSupportStatuses(globalForDb.lumenDb);
  globalForDb.lumenDb.exec(`
    CREATE TABLE IF NOT EXISTS support_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_support_followups_request ON support_followups(request_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
  `);
  const resetColumns = columnNames(globalForDb.lumenDb, "password_resets");
  if (resetColumns.size > 0 && !resetColumns.has("account_kind")) {
    globalForDb.lumenDb.exec("ALTER TABLE password_resets ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'desk'");
  }
  ensureLineStatuses(globalForDb.lumenDb);
  return globalForDb.lumenDb;
}

export function one<T>(sql: string, ...params: SQLInputValue[]) {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function many<T>(sql: string, ...params: SQLInputValue[]) {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return getDb().prepare(sql).run(...params);
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'customer')),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      speed_mbps INTEGER NOT NULL,
      price INTEGER NOT NULL,
      data_cap TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      mobile TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      renew_date TEXT NOT NULL,
      installation_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      reference TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK(kind IN ('full', 'partial'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_renew ON customers(renew_date);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      product_plan TEXT NOT NULL DEFAULT 'free' CHECK(product_plan IN ('free', 'pro', 'ultra', 'premium')),
      support_phone TEXT NOT NULL DEFAULT '',
      logo_letter TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      imported INTEGER NOT NULL,
      skipped INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'customers'
    );

    CREATE TABLE IF NOT EXISTS import_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      line INTEGER NOT NULL,
      message TEXT NOT NULL
    );
  `);

  const userColumns = columnNames(db, "users");
  if (!userColumns.has("provider_id")) {
    db.exec("ALTER TABLE users ADD COLUMN provider_id INTEGER");
    db.exec("ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.has("mobile")) {
    db.exec("ALTER TABLE users ADD COLUMN mobile TEXT NOT NULL DEFAULT ''");
  }
  if (!userColumns.has("login_password")) {
    db.exec("ALTER TABLE users ADD COLUMN login_password TEXT NOT NULL DEFAULT ''");
  }
  if (!columnNames(db, "customers").has("area")) {
    db.exec("ALTER TABLE customers ADD COLUMN area TEXT NOT NULL DEFAULT ''");
  }
  if (!columnNames(db, "customers").has("bill_cycle")) {
    db.exec("ALTER TABLE customers ADD COLUMN bill_cycle TEXT NOT NULL DEFAULT 'monthly'");
  }
  if (!columnNames(db, "customers").has("reminders")) {
    db.exec("ALTER TABLE customers ADD COLUMN reminders INTEGER NOT NULL DEFAULT 1");
  }
  ensureCustomerTaxColumns(db);
  ensureLineStatuses(db);
  if (!columnNames(db, "reminders").has("channel")) {
    db.exec("ALTER TABLE reminders ADD COLUMN channel TEXT NOT NULL DEFAULT 'portal'");
  }
  if (!columnNames(db, "reminders").has("stage")) {
    db.exec("ALTER TABLE reminders ADD COLUMN stage TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE reminders ADD COLUMN cycle_date TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'closed', 'cancelled', 'duplicate')),
      provider_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      assignee_id INTEGER,
      resolved_at TEXT NOT NULL DEFAULT '',
      sla_hours INTEGER NOT NULL DEFAULT 24
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_renewal_once ON reminders(customer_id, stage, cycle_date) WHERE stage != '';
  `);
  if (!columnNames(db, "plans").has("provider_id")) {
    const planCount = db.prepare("SELECT COUNT(*) AS n FROM plans").get() as { n: number };
    let providerId = 0;
    if (planCount.n > 0) {
      const existing = db.prepare("SELECT id FROM providers ORDER BY id LIMIT 1").get() as { id: number } | undefined;
      if (existing) providerId = existing.id;
      else {
        const created = db
          .prepare(
            "INSERT INTO providers (name, product_plan, support_phone, logo_letter, created_at) VALUES ('Lumen Fibre', 'ultra', '1800123456', 'L', ?)",
          )
          .run(nowStamp());
        providerId = Number(created.lastInsertRowid);
      }
    }
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS plans_next");
    db.exec(`
      CREATE TABLE plans_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        speed_mbps INTEGER NOT NULL,
        price INTEGER NOT NULL,
        data_cap TEXT NOT NULL,
        description TEXT NOT NULL,
        UNIQUE (provider_id, name)
      );
    `);
    if (planCount.n > 0) {
      db.prepare(
        `INSERT INTO plans_next (id, provider_id, name, speed_mbps, price, data_cap, description)
         SELECT id, ?, name, speed_mbps, price, data_cap, description FROM plans`,
      ).run(providerId);
      db.prepare(
        "UPDATE users SET provider_id = ?, is_owner = CASE WHEN role = 'admin' THEN 1 ELSE 0 END WHERE provider_id IS NULL",
      ).run(providerId);
    }
    db.exec("DROP TABLE plans");
    db.exec("ALTER TABLE plans_next RENAME TO plans");
    db.exec("PRAGMA foreign_keys = ON");
  }

  const providerSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'providers'").get() as
    | { sql: string }
    | undefined;
  if (providerSql && !providerSql.sql.includes("premium_3000") && !providerSql.sql.includes("'premium'")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS providers_next");
    db.exec(`
      CREATE TABLE providers_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        product_plan TEXT NOT NULL DEFAULT 'free' CHECK(product_plan IN ('free', 'pro', 'ultra', 'premium')),
        support_phone TEXT NOT NULL DEFAULT '',
        logo_letter TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
    db.exec(
      `INSERT INTO providers_next (id, name, product_plan, support_phone, logo_letter, created_at)
       SELECT id, name, product_plan, support_phone, logo_letter, created_at FROM providers`,
    );
    db.exec("DROP TABLE providers");
    db.exec("ALTER TABLE providers_next RENAME TO providers");
    db.exec("PRAGMA foreign_keys = ON");
  }

  const providerColumns = columnNames(db, "providers");
  if (!providerColumns.has("subscriber_base")) {
    db.exec("ALTER TABLE providers ADD COLUMN subscriber_base INTEGER NOT NULL DEFAULT 0");
  }
  if (!providerColumns.has("trial_ends")) {
    db.exec("ALTER TABLE providers ADD COLUMN trial_ends TEXT NOT NULL DEFAULT ''");
  }
  db.exec("UPDATE providers SET product_plan = 'pro' WHERE product_plan = 'free'");

  const planSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'providers'").get() as
    | { sql: string }
    | undefined;
  if (planSql && !planSql.sql.includes("'premium_3000'")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS providers_next");
    db.exec(`
      CREATE TABLE providers_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        product_plan TEXT NOT NULL DEFAULT 'pro' CHECK(product_plan IN (
          'pro', 'ultra', 'premium_3000', 'premium_5000', 'premium_10000', 'premium_20000', 'premium_30000'
        )),
        support_phone TEXT NOT NULL DEFAULT '',
        logo_letter TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        subscriber_base INTEGER NOT NULL DEFAULT 0,
        trial_ends TEXT NOT NULL DEFAULT ''
      );
    `);
    db.exec(`
      INSERT INTO providers_next (id, name, product_plan, support_phone, logo_letter, created_at, subscriber_base, trial_ends)
      SELECT id, name,
        CASE product_plan WHEN 'premium' THEN 'premium_3000' WHEN 'free' THEN 'pro' ELSE product_plan END,
        support_phone, logo_letter, created_at, subscriber_base, trial_ends
      FROM providers
    `);
    db.exec("DROP TABLE providers");
    db.exec("ALTER TABLE providers_next RENAME TO providers");
    db.exec("PRAGMA foreign_keys = ON");
  }

  ensureReceiptSchema(db);
}

function ensureReceiptSchema(db: DatabaseSync) {
  const billColumns = columnNames(db, "providers");
  if (!billColumns.has("gstin")) db.exec("ALTER TABLE providers ADD COLUMN gstin TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("address")) db.exec("ALTER TABLE providers ADD COLUMN address TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("city")) db.exec("ALTER TABLE providers ADD COLUMN city TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("state")) db.exec("ALTER TABLE providers ADD COLUMN state TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("country")) db.exec("ALTER TABLE providers ADD COLUMN country TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("pincode")) db.exec("ALTER TABLE providers ADD COLUMN pincode TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("pay_method")) db.exec("ALTER TABLE providers ADD COLUMN pay_method TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("pay_via")) db.exec("ALTER TABLE providers ADD COLUMN pay_via TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("pay_holder")) db.exec("ALTER TABLE providers ADD COLUMN pay_holder TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("pay_detail")) db.exec("ALTER TABLE providers ADD COLUMN pay_detail TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("pay_expiry")) db.exec("ALTER TABLE providers ADD COLUMN pay_expiry TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("reminder_soon_title")) db.exec("ALTER TABLE providers ADD COLUMN reminder_soon_title TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("reminder_soon_body")) db.exec("ALTER TABLE providers ADD COLUMN reminder_soon_body TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("reminder_due_title")) db.exec("ALTER TABLE providers ADD COLUMN reminder_due_title TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("reminder_due_body")) db.exec("ALTER TABLE providers ADD COLUMN reminder_due_body TEXT NOT NULL DEFAULT ''");
  if (!billColumns.has("billing_term")) db.exec("ALTER TABLE providers ADD COLUMN billing_term TEXT NOT NULL DEFAULT 'monthly'");

  const orderColumns = columnNames(db, "upgrade_orders");
  if (orderColumns.size > 0 && !orderColumns.has("billing_term")) {
    db.exec("ALTER TABLE upgrade_orders ADD COLUMN billing_term TEXT NOT NULL DEFAULT 'monthly'");
  }
  if (orderColumns.size > 0 && !orderColumns.has("promo_code")) {
    db.exec("ALTER TABLE upgrade_orders ADD COLUMN promo_code TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE upgrade_orders ADD COLUMN promo_off INTEGER NOT NULL DEFAULT 0");
  }

  const batchColumns = columnNames(db, "import_batches");
  if (batchColumns.size > 0 && !batchColumns.has("kind")) {
    db.exec("ALTER TABLE import_batches ADD COLUMN kind TEXT NOT NULL DEFAULT 'customers'");
  }
  if (batchColumns.size > 0 && !batchColumns.has("updated")) {
    db.exec("ALTER TABLE import_batches ADD COLUMN updated INTEGER NOT NULL DEFAULT 0");
  }

  const paymentColumns = columnNames(db, "payments");
  if (!paymentColumns.has("receipt_snapshot")) {
    db.exec("ALTER TABLE payments ADD COLUMN receipt_snapshot TEXT NOT NULL DEFAULT ''");
  }
  if (paymentColumns.size > 0 && !paymentColumns.has("line_items")) {
    db.exec("ALTER TABLE payments ADD COLUMN line_items TEXT NOT NULL DEFAULT ''");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('once', 'recurring')),
      amount INTEGER NOT NULL,
      billed INTEGER NOT NULL DEFAULT 0,
      tax_included INTEGER NOT NULL DEFAULT 1,
      tax_percent INTEGER NOT NULL DEFAULT 0
    );
  `);
  const chargeColumns = columnNames(db, "customer_charges");
  if (chargeColumns.size > 0 && !chargeColumns.has("tax_included")) {
    db.exec("ALTER TABLE customer_charges ADD COLUMN tax_included INTEGER NOT NULL DEFAULT 1");
  }
  if (chargeColumns.size > 0 && !chargeColumns.has("tax_percent")) {
    db.exec("ALTER TABLE customer_charges ADD COLUMN tax_percent INTEGER NOT NULL DEFAULT 0");
  }
  if (chargeColumns.size > 0 && !chargeColumns.has("bill_cycle")) {
    db.exec("ALTER TABLE customer_charges ADD COLUMN bill_cycle TEXT NOT NULL DEFAULT ''");
  }
  if (chargeColumns.size > 0 && !chargeColumns.has("activated_on")) {
    db.exec("ALTER TABLE customer_charges ADD COLUMN activated_on TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      applies_to TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('amount', 'percent')),
      value INTEGER NOT NULL
    );
  `);
  const discountColumns = columnNames(db, "customer_discounts");
  if (discountColumns.size > 0 && !discountColumns.has("frequency")) {
    db.exec("ALTER TABLE customer_discounts ADD COLUMN frequency TEXT NOT NULL DEFAULT 'recurring'");
  }
  if (discountColumns.size > 0 && !discountColumns.has("billed")) {
    db.exec("ALTER TABLE customer_discounts ADD COLUMN billed INTEGER NOT NULL DEFAULT 0");
  }
  if (discountColumns.size > 0 && !discountColumns.has("activated_on")) {
    db.exec("ALTER TABLE customer_discounts ADD COLUMN activated_on TEXT NOT NULL DEFAULT ''");
  }
  if (discountColumns.size > 0 && !discountColumns.has("renews_on")) {
    db.exec("ALTER TABLE customer_discounts ADD COLUMN renews_on TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_extra_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      bill_cycle TEXT NOT NULL,
      tax_included INTEGER NOT NULL DEFAULT 1,
      tax_percent INTEGER NOT NULL DEFAULT 0
    );
  `);
  const extraColumns = columnNames(db, "customer_extra_plans");
  if (extraColumns.size > 0 && !extraColumns.has("amount")) {
    db.exec("ALTER TABLE customer_extra_plans ADD COLUMN amount INTEGER NOT NULL DEFAULT 0");
  }
  if (extraColumns.size > 0 && !extraColumns.has("activated_on")) {
    db.exec("ALTER TABLE customer_extra_plans ADD COLUMN activated_on TEXT NOT NULL DEFAULT ''");
  }
  if (extraColumns.size > 0 && !extraColumns.has("renews_on")) {
    db.exec("ALTER TABLE customer_extra_plans ADD COLUMN renews_on TEXT NOT NULL DEFAULT ''");
  }

  const deskColumns = columnNames(db, "desk_payments");
  if (deskColumns.size > 0 && !deskColumns.has("unbilled_overage")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN unbilled_overage INTEGER NOT NULL DEFAULT 0");
  }
  if (deskColumns.size > 0 && !deskColumns.has("unbilled_carried")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN unbilled_carried INTEGER NOT NULL DEFAULT 0");
  }
  if (deskColumns.size > 0 && !deskColumns.has("prior_overage")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN prior_overage INTEGER NOT NULL DEFAULT 0");
  }
  if (deskColumns.size > 0 && !deskColumns.has("prior_period")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN prior_period TEXT NOT NULL DEFAULT ''");
  }
  if (deskColumns.size > 0 && !deskColumns.has("staff_overage_amount")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN staff_overage_amount INTEGER NOT NULL DEFAULT 0");
  }
  if (deskColumns.size > 0 && !deskColumns.has("unbilled_staff")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN unbilled_staff INTEGER NOT NULL DEFAULT 0");
  }
  if (deskColumns.size > 0 && !deskColumns.has("prior_staff_overage")) {
    db.exec("ALTER TABLE desk_payments ADD COLUMN prior_staff_overage INTEGER NOT NULL DEFAULT 0");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      legal_name TEXT NOT NULL,
      gstin TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS desk_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      plan_label TEXT NOT NULL,
      plan_amount INTEGER NOT NULL,
      overage_amount INTEGER NOT NULL,
      taxable INTEGER NOT NULL,
      tax INTEGER NOT NULL,
      total INTEGER NOT NULL,
      gst_mode TEXT NOT NULL CHECK(gst_mode IN ('none', 'cgst', 'igst')),
      seller_name TEXT NOT NULL,
      seller_gstin TEXT NOT NULL DEFAULT '',
      seller_address TEXT NOT NULL DEFAULT '',
      seller_city TEXT NOT NULL DEFAULT '',
      seller_state TEXT NOT NULL DEFAULT '',
      seller_phone TEXT NOT NULL DEFAULT '',
      seller_email TEXT NOT NULL DEFAULT '',
      buyer_name TEXT NOT NULL,
      buyer_gstin TEXT NOT NULL DEFAULT '',
      buyer_address TEXT NOT NULL DEFAULT '',
      buyer_city TEXT NOT NULL DEFAULT '',
      buyer_state TEXT NOT NULL DEFAULT '',
      buyer_phone TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      paid_at TEXT NOT NULL DEFAULT '',
      issued_at TEXT NOT NULL,
      unbilled_overage INTEGER NOT NULL DEFAULT 0,
      unbilled_carried INTEGER NOT NULL DEFAULT 0,
      prior_overage INTEGER NOT NULL DEFAULT 0,
      prior_period TEXT NOT NULL DEFAULT '',
      staff_overage_amount INTEGER NOT NULL DEFAULT 0,
      unbilled_staff INTEGER NOT NULL DEFAULT 0,
      prior_staff_overage INTEGER NOT NULL DEFAULT 0,
      UNIQUE(provider_id, period)
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO platform_profile (id, legal_name, email) VALUES (1, 'Zignal Connect', ?)`,
  ).run(DEMO_OPERATOR.email);

  db.exec(`
    CREATE TABLE IF NOT EXISTS upgrade_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      product_plan TEXT NOT NULL,
      subscriber_base INTEGER NOT NULL,
      plan_label TEXT NOT NULL,
      plan_amount INTEGER NOT NULL,
      tax INTEGER NOT NULL,
      total INTEGER NOT NULL,
      gst_mode TEXT NOT NULL CHECK(gst_mode IN ('none', 'cgst', 'igst')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'paid')) DEFAULT 'pending',
      created_at TEXT NOT NULL,
      paid_at TEXT NOT NULL DEFAULT '',
      billing_term TEXT NOT NULL DEFAULT 'monthly',
      promo_code TEXT NOT NULL DEFAULT '',
      promo_off INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plan_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL CHECK(mode IN ('amount', 'percent')),
      value INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);
}

function ensureLineStatuses(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'customers'").get() as
    | { sql: string }
    | undefined;
  if (!row || row.sql.includes("'disconnected'")) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS customers_next");
  db.exec(`
    CREATE TABLE customers_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      mobile TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'suspended', 'disconnected', 'collection', 'write_off')),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      renew_date TEXT NOT NULL,
      installation_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT ''
    );
  `);
  db.exec(`
    INSERT INTO customers_next (id, user_id, mobile, address, city, status, plan_id, renew_date, installation_date, notes, area)
    SELECT id, user_id, mobile, address, city, status, plan_id, renew_date, installation_date, notes, area FROM customers
  `);
  db.exec("DROP TABLE customers");
  db.exec("ALTER TABLE customers_next RENAME TO customers");
  db.exec("CREATE INDEX IF NOT EXISTS idx_customers_renew ON customers(renew_date)");
  db.exec("PRAGMA foreign_keys = ON");
}

function ensurePlatformAdmin(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const existing = db.prepare("SELECT id FROM platform_admins WHERE email = ?").get(ZIGNAL_ADMIN_EMAIL) as { id: number } | undefined;
  if (existing) return;
  db.prepare("INSERT INTO platform_admins (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)").run(
    ZIGNAL_ADMIN_EMAIL,
    ZIGNAL_ADMIN_PASSWORD_HASH,
    ZIGNAL_ADMIN_NAME,
    nowStamp(),
  );
}

const PUBLISHED_DEMO_PASSWORDS = ["admin123", "welcome123"];

function retirePublishedDemoLogins(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const retired = db.prepare("SELECT value FROM app_meta WHERE key = ?").get("published_demo_logins_retired") as
    | { value: string }
    | undefined;
  if (!retired) {
    const users = db.prepare("SELECT id, password_hash FROM users").all() as { id: number; password_hash: string }[];
    const clearLogin = db.prepare("UPDATE users SET password_hash = ?, login_password = '' WHERE id = ?");
    for (const user of users) {
      const published = PUBLISHED_DEMO_PASSWORDS.some((password) => verifyPassword(password, user.password_hash));
      if (!published) continue;
      clearLogin.run(hashPassword(crypto.randomBytes(24).toString("base64url")), user.id);
    }
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('published_demo_logins_retired', '1')").run();
  }

  const rotated = db.prepare("SELECT value FROM app_meta WHERE key = ?").get("zignal_admin_password_set") as
    | { value: string }
    | undefined;
  if (!rotated) {
    const operator = db.prepare("SELECT id, password_hash FROM platform_admins WHERE email = ?").get(ZIGNAL_ADMIN_EMAIL) as
      | { id: number; password_hash: string }
      | undefined;
    if (operator && verifyPassword("zignal123", operator.password_hash)) {
      db.prepare("UPDATE platform_admins SET password_hash = ? WHERE id = ?").run(ZIGNAL_ADMIN_PASSWORD_HASH, operator.id);
    }
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('zignal_admin_password_set', '1')").run();
  }
}

function ensureSupportStatuses(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'support_requests'").get() as
    | { sql: string }
    | undefined;
  if (!row || row.sql.includes("'cancelled'")) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS support_requests_next");
  db.exec(`
    CREATE TABLE support_requests_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mobile TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('new', 'in_progress', 'closed', 'cancelled', 'duplicate')),
      reply TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT ''
    );
  `);
  db.exec(`
    INSERT INTO support_requests_next
      (id, provider_id, user_id, mobile, message, status, reply, created_at, updated_at, resolved_at, priority, topic)
    SELECT id, provider_id, user_id, mobile, message,
      CASE status
        WHEN 'open' THEN 'new'
        WHEN 'resolved' THEN 'closed'
        WHEN 'in_progress' THEN 'in_progress'
        WHEN 'new' THEN 'new'
        WHEN 'closed' THEN 'closed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'duplicate' THEN 'duplicate'
        ELSE 'new'
      END,
      reply, created_at, updated_at,
      CASE
        WHEN status IN ('resolved', 'closed', 'cancelled', 'duplicate') THEN CASE WHEN resolved_at = '' THEN updated_at ELSE resolved_at END
        ELSE ''
      END,
      priority, topic
    FROM support_requests
  `);
  db.exec("DROP TABLE support_requests");
  db.exec("ALTER TABLE support_requests_next RENAME TO support_requests");
  db.exec("PRAGMA foreign_keys = ON");
}

function ensureComplaintDesk(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'complaints'").get() as
    | { sql: string }
    | undefined;
  if (!row || row.sql.includes("'new'") || row.sql.includes("'cancelled'")) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS complaints_next");
  db.exec(`
    CREATE TABLE complaints_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('new', 'assigned', 'pending', 'resolved')),
      provider_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      assignee_id INTEGER,
      resolved_at TEXT NOT NULL DEFAULT '',
      sla_hours INTEGER NOT NULL DEFAULT 24
    );
  `);
  db.exec(`
    INSERT INTO complaints_next
      (id, customer_id, category, details, status, provider_note, created_at, updated_at, resolved_at, sla_hours)
    SELECT id, customer_id, category, details,
      CASE status WHEN 'open' THEN 'new' WHEN 'in_progress' THEN 'assigned' WHEN 'resolved' THEN 'resolved' ELSE 'new' END,
      provider_note, created_at, updated_at,
      CASE WHEN status = 'resolved' THEN updated_at ELSE '' END,
      CASE category WHEN 'no_internet' THEN 4 WHEN 'drops' THEN 8 WHEN 'slow' THEN 24 ELSE 48 END
    FROM complaints
  `);
  db.exec("DROP TABLE complaints");
  db.exec("ALTER TABLE complaints_next RENAME TO complaints");
  db.exec("PRAGMA foreign_keys = ON");
}

function ensureComplaintOutcomes(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'complaints'").get() as
    | { sql: string }
    | undefined;
  if (!row || row.sql.includes("'cancelled'")) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS complaints_next");
  db.exec(`
    CREATE TABLE complaints_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'closed', 'cancelled', 'duplicate')),
      provider_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      assignee_id INTEGER,
      resolved_at TEXT NOT NULL DEFAULT '',
      sla_hours INTEGER NOT NULL DEFAULT 24
    );
  `);
  db.exec(`
    INSERT INTO complaints_next
      (id, customer_id, category, details, status, provider_note, created_at, updated_at, resolved_at, sla_hours)
    SELECT id, customer_id, category, details,
      CASE status
        WHEN 'new' THEN 'open'
        WHEN 'assigned' THEN 'in_progress'
        WHEN 'pending' THEN 'in_progress'
        WHEN 'resolved' THEN 'closed'
        WHEN 'open' THEN 'open'
        WHEN 'in_progress' THEN 'in_progress'
        WHEN 'closed' THEN 'closed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'duplicate' THEN 'duplicate'
        ELSE 'open'
      END,
      provider_note, created_at, updated_at,
      CASE
        WHEN status IN ('resolved', 'closed', 'cancelled', 'duplicate') THEN CASE WHEN resolved_at = '' THEN updated_at ELSE resolved_at END
        ELSE ''
      END,
      sla_hours
    FROM complaints
  `);
  db.exec("DROP TABLE complaints");
  db.exec("ALTER TABLE complaints_next RENAME TO complaints");
  db.exec("PRAGMA foreign_keys = ON");
}

function hoursAgo(hours: number) {
  const date = new Date(Date.now() - hours * 60 * 60 * 1000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function seedDemoComplaints(db: DatabaseSync) {
  const owner = db.prepare("SELECT id, provider_id FROM users WHERE email = ?").get(DEMO_ADMIN.email) as
    | { id: number; provider_id: number }
    | undefined;
  if (!owner?.provider_id) return;
  const existing = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM complaints k
       JOIN customers c ON c.id = k.customer_id
       JOIN users u ON u.id = c.user_id
       WHERE u.provider_id = ?`,
    )
    .get(owner.provider_id) as { n: number };
  if (existing.n > 0) return;
  const customers = db
    .prepare(
      `SELECT c.id FROM customers c
       JOIN users u ON u.id = c.user_id
       WHERE u.provider_id = ?
       ORDER BY c.id
       LIMIT 5`,
    )
    .all(owner.provider_id) as { id: number }[];
  if (customers.length < 4) return;
  const insert = db.prepare(
    `INSERT INTO complaints
      (customer_id, category, details, status, provider_note, created_at, updated_at, assignee_id, resolved_at, sla_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const samples = [
    {
      customer_id: customers[0].id,
      category: "no_internet",
      details: "The line has been down since this morning. The ONT power light is red and the Wi-Fi light is off.",
      status: "open",
      note: "",
      created: hoursAgo(1),
      assignee: null,
      resolved: "",
      sla: 4,
    },
    {
      customer_id: customers[1].id,
      category: "drops",
      details: "The connection drops every few minutes after 7pm. It comes back on its own after a restart.",
      status: "in_progress",
      note: "Field visit booked for this evening.",
      created: hoursAgo(6),
      assignee: owner.id,
      resolved: "",
      sla: 8,
    },
    {
      customer_id: customers[2].id,
      category: "slow",
      details: "A speed test stays under 10 Mbps on the 300 Mbps plan, on both Wi-Fi and the LAN cable.",
      status: "in_progress",
      note: "Waiting for the subscriber to confirm a time for the line test.",
      created: hoursAgo(30),
      assignee: owner.id,
      resolved: "",
      sla: 24,
    },
    {
      customer_id: customers[3].id,
      category: "no_internet",
      details: "No internet after yesterday's rain. The link light on the router was off.",
      status: "closed",
      note: "Fibre joint was reseated. The line tested at the plan speed.",
      created: hoursAgo(50),
      assignee: owner.id,
      resolved: hoursAgo(47),
      sla: 4,
    },
    {
      customer_id: customers[Math.min(4, customers.length - 1)].id,
      category: "other",
      details: "The router was replaced, but the old Wi-Fi name did not come back and the TV box cannot find the line.",
      status: "closed",
      note: "New router configured and the TV box was paired again.",
      created: hoursAgo(80),
      assignee: owner.id,
      resolved: hoursAgo(20),
      sla: 48,
    },
  ];
  db.exec("BEGIN");
  try {
    for (const sample of samples) {
      insert.run(
        sample.customer_id,
        sample.category,
        sample.details,
        sample.status,
        sample.note,
        sample.created,
        sample.resolved || sample.created,
        sample.assignee,
        sample.resolved,
        sample.sla,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureCustomerTaxColumns(db: DatabaseSync) {
  const columns = columnNames(db, "customers");
  if (columns.size === 0) return;
  const adds: [string, string][] = [
    ["plan_frequency", "TEXT NOT NULL DEFAULT 'recurring'"],
    ["plan_tax_included", "INTEGER NOT NULL DEFAULT 1"],
    ["plan_tax_percent", "INTEGER NOT NULL DEFAULT 0"],
    ["plan_billed", "INTEGER NOT NULL DEFAULT 0"],
    ["invoice_tax_included", "INTEGER NOT NULL DEFAULT 1"],
    ["invoice_tax_percent", "INTEGER NOT NULL DEFAULT 0"],
    ["plan_amount", "INTEGER NOT NULL DEFAULT 0"],
    ["plan_cycle", "TEXT NOT NULL DEFAULT ''"],
    ["plan_label", "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, definition] of adds) {
    if (!columns.has(name)) db.exec(`ALTER TABLE customers ADD COLUMN ${name} ${definition}`);
  }
  if (!columnNames(db, "plans").has("listed")) {
    db.exec("ALTER TABLE plans ADD COLUMN listed INTEGER NOT NULL DEFAULT 1");
  }
  if (columnNames(db, "customer_extra_plans").size > 0 && !columnNames(db, "customer_extra_plans").has("label")) {
    db.exec("ALTER TABLE customer_extra_plans ADD COLUMN label TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS charge_catalogue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      tax_included INTEGER NOT NULL DEFAULT 1,
      tax_percent INTEGER NOT NULL DEFAULT 0,
      UNIQUE (provider_id, name)
    );
    CREATE TABLE IF NOT EXISTS discount_catalogue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      applies_to TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'recurring',
      mode TEXT NOT NULL,
      value INTEGER NOT NULL,
      UNIQUE (provider_id, name)
    );
  `);
}

function columnNames(db: DatabaseSync, table: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function seed(db: DatabaseSync) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (existing.n > 0) return;

  const today = todayISO();
  const stamp = nowStamp();
  const plans = [
    ["Home 100", 100, 699, "Unlimited", "Light browsing, music, and HD video on a couple of screens."],
    ["Home 300", 300, 999, "Unlimited", "The usual family line: work calls, school, and 4K in the evening."],
    ["Home 500", 500, 1499, "Unlimited", "Heavy uploads, cameras, and several people online at once."],
    ["Gig", 1000, 2499, "Unlimited", "Full gigabit fiber for studios and large households."],
  ] as const;

  const people = [
    {
      name: "Arjun Mehta",
      email: "arjun.mehta@mail.com",
      mobile: "9820091104",
      address: "14, Pali Hill Road, Bandra West",
      city: "Mumbai",
      plan: "Home 300",
      renew: 4,
      installed: -240,
      status: "active",
      notes: "ONT is in the living room cabinet. Prefers SMS before a technician visit.",
      paid: -26,
      method: "UPI",
    },
    {
      name: "Sana Qureshi",
      email: "sana.qureshi@mail.com",
      mobile: "9849012276",
      address: "8-2-120/86, Road No. 2, Banjara Hills",
      city: "Hyderabad",
      plan: "Home 300",
      renew: -3,
      installed: -400,
      status: "active",
      notes: "Asked for a morning slot if the line needs a site visit.",
      paid: -33,
      method: "Card",
    },
    {
      name: "Rohan Iyer",
      email: "rohan.iyer@mail.com",
      mobile: "9886021145",
      address: "42, 12th Main, Indiranagar",
      city: "Bengaluru",
      plan: "Home 300",
      renew: 18,
      installed: -120,
      status: "active",
      notes: "",
      paid: -12,
      method: "Net banking",
    },
    {
      name: "Meera Nair",
      email: "meera.nair@mail.com",
      mobile: "9745123088",
      address: "Villa 6, Oceanus Layout, Panampilly Nagar",
      city: "Kochi",
      plan: "Home 500",
      renew: 27,
      installed: -80,
      status: "active",
      notes: "Paid the current cycle a few days ago.",
      paid: -3,
      method: "UPI",
    },
    {
      name: "Vikram Singh",
      email: "vikram.singh@mail.com",
      mobile: "9414056621",
      address: "C-19, Raja Park",
      city: "Jaipur",
      plan: "Home 100",
      renew: 2,
      installed: -510,
      status: "active",
      notes: "",
      paid: -28,
      method: "Cash",
    },
    {
      name: "Ananya Desai",
      email: "ananya.desai@mail.com",
      mobile: "9922001844",
      address: "701, Koregaon Park Plaza",
      city: "Pune",
      plan: "Gig",
      renew: 12,
      installed: -60,
      status: "active",
      notes: "Runs a home studio. Upload speed matters more than the headline download.",
      paid: -18,
      method: "Card",
    },
    {
      name: "Kabir Hussain",
      email: "kabir.hussain@mail.com",
      mobile: "9839014420",
      address: "22, Hazratganj",
      city: "Lucknow",
      plan: "Home 100",
      renew: -15,
      installed: -300,
      status: "suspended",
      notes: "Line paused after the last cycle went unpaid. Reactivates on the next full payment.",
      paid: -50,
      method: "UPI",
    },
    {
      name: "Fatima Khan",
      email: "fatima.khan@mail.com",
      mobile: "9425301187",
      address: "15, New Market, TT Nagar",
      city: "Bhopal",
      plan: "Home 500",
      renew: 6,
      installed: -190,
      status: "active",
      notes: "",
      paid: -24,
      method: "Net banking",
    },
  ];

  const insertPlan = db.prepare(
    "INSERT INTO plans (provider_id, name, speed_mbps, price, data_cap, description) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertUser = db.prepare(
    "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'customer', ?, ?, ?, 0)",
  );
  const insertCustomer = db.prepare(
    `INSERT INTO customers
      (user_id, mobile, address, city, status, plan_id, renew_date, installation_date, notes, area)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
  );
  const insertPayment = db.prepare(
    `INSERT INTO payments
      (customer_id, amount, method, reference, paid_at, period_start, period_end, note, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', 'full')`,
  );
  const insertReminder = db.prepare(
    "INSERT INTO reminders (customer_id, title, body, created_at, channel) VALUES (?, ?, ?, ?, 'portal')",
  );

  db.exec("BEGIN");
  try {
  const provider = db
    .prepare(
      "INSERT INTO providers (name, product_plan, support_phone, logo_letter, created_at) VALUES ('Lumen Fibre', 'ultra', '1800123456', 'L', ?)",
    )
    .run(stamp);
  const providerId = Number(provider.lastInsertRowid);
  db.prepare(
    "INSERT INTO users (email, password_hash, role, name, created_at, provider_id, is_owner) VALUES (?, ?, 'admin', ?, ?, ?, 1)",
  ).run(DEMO_ADMIN.email, hashPassword(crypto.randomBytes(24).toString("base64url")), DEMO_ADMIN.name, stamp, providerId);

  const planIds = new Map<string, { id: number; price: number }>();
  for (const plan of plans) {
    const result = insertPlan.run(providerId, ...plan);
    planIds.set(plan[0], { id: Number(result.lastInsertRowid), price: plan[2] });
  }

  const customerPassword = hashPassword(crypto.randomBytes(24).toString("base64url"));
  people.forEach((person, index) => {
    const plan = planIds.get(person.plan);
    if (!plan) throw new Error(`Missing plan ${person.plan}`);
    const user = insertUser.run(person.email, customerPassword, person.name, stamp, providerId);
    const renewDate = addDays(today, person.renew);
    const customer = insertCustomer.run(
      Number(user.lastInsertRowid),
      person.mobile,
      person.address,
      person.city,
      person.status,
      plan.id,
      renewDate,
      addDays(today, person.installed),
      person.notes,
    );
    const customerId = Number(customer.lastInsertRowid);
    insertPayment.run(
      customerId,
      plan.price,
      person.method,
      `LMNSEED${String(index + 1).padStart(3, "0")}`,
      `${addDays(today, person.paid)} 11:20`,
      addMonths(renewDate, -1),
      renewDate,
    );
  });

  const sana = db.prepare("SELECT c.id AS id FROM customers c JOIN users u ON u.id = c.user_id WHERE u.email = ?").get(
    "sana.qureshi@mail.com",
  ) as { id: number };
  const vikram = db.prepare("SELECT c.id AS id FROM customers c JOIN users u ON u.id = c.user_id WHERE u.email = ?").get(
    "vikram.singh@mail.com",
  ) as { id: number };

  insertReminder.run(
    sana.id,
    "Payment overdue",
    "Your Home 300 renewal is past the due date. Pay ₹999 from the portal to keep the line current.",
    `${addDays(today, -1)} 09:15`,
  );
  insertReminder.run(
    vikram.id,
    "Renewal coming up",
    "Home 100 renews in a couple of days. The amount due is ₹699. You can pay from the portal.",
    `${today} 08:40`,
  );

  db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
