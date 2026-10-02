import fs from "fs";
import path from "path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { DEMO_ADMIN, DEMO_CUSTOMER_PASSWORD, DEMO_OPERATOR } from "@/lib/demo";
import { addDays, addMonths, nowStamp, todayISO } from "@/lib/format";
import { hashPassword } from "@/lib/password";

const SCHEMA = 6;
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
  ensurePlatformAdmin(globalForDb.lumenDb);
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
  globalForDb.lumenDb.exec(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      mobile TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'resolved')),
      reply TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
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
      skipped INTEGER NOT NULL
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
      status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'resolved')),
      provider_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
  if (providerSql && !providerSql.sql.includes("'premium'")) {
    db.exec("PRAGMA foreign_keys = OFF");
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
  const existing = db.prepare("SELECT id FROM platform_admins WHERE email = ?").get(DEMO_OPERATOR.email) as { id: number } | undefined;
  if (existing) return;
  db.prepare("INSERT INTO platform_admins (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)").run(
    DEMO_OPERATOR.email,
    hashPassword(DEMO_OPERATOR.password),
    DEMO_OPERATOR.name,
    nowStamp(),
  );
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
  ).run(DEMO_ADMIN.email, hashPassword(DEMO_ADMIN.password), DEMO_ADMIN.name, stamp, providerId);

  const planIds = new Map<string, { id: number; price: number }>();
  for (const plan of plans) {
    const result = insertPlan.run(providerId, ...plan);
    planIds.set(plan[0], { id: Number(result.lastInsertRowid), price: plan[2] });
  }

  const customerPassword = hashPassword(DEMO_CUSTOMER_PASSWORD);
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
