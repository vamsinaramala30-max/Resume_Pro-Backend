// src/lib/db.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, "..", "data", "vkpro.db");

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    provider TEXT DEFAULT 'email',
    is_verified INTEGER DEFAULT 1,
    password TEXT,
    role TEXT DEFAULT 'user',
    plan TEXT DEFAULT 'FREE',
    subscription_status TEXT DEFAULT 'inactive',
    email_verified INTEGER DEFAULT 0,
    account_status TEXT DEFAULT 'active',
    last_login TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    payload TEXT DEFAULT '{}',
    title TEXT DEFAULT '',
    premium INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    order_id TEXT,
    payment_id TEXT,
    amount INTEGER,
    currency TEXT DEFAULT 'INR',
    plan TEXT DEFAULT 'PRO',
    status TEXT DEFAULT 'paid',
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    source TEXT DEFAULT 'footer',
    created_at TEXT,
    updated_at TEXT
  );
`);

export function isUsingSqlite() { return true; }
export function isUsingPersistentStorage() { return true; }

// Helper to convert SQLite database row to JS object
function mapUserFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    email: row.email,
    provider: row.provider || "email",
    isVerified: row.is_verified === 1,
    password: row.password,
    role: row.role || "user",
    plan: row.plan || "FREE",
    subscriptionStatus: row.subscription_status || "inactive",
    emailVerified: row.email_verified === 1,
    accountStatus: row.account_status || "active",
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapResumeFromDb(row) {
  if (!row) return null;
  let parsedPayload = {};
  try {
    parsedPayload = JSON.parse(row.payload);
  } catch (e) {
    parsedPayload = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    payload: parsedPayload,
    title: row.title || "",
    premium: row.premium === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPaymentFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    amount: row.amount,
    currency: row.currency || "INR",
    plan: row.plan || "PRO",
    status: row.status || "paid",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSubscriberFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || "",
    status: row.status || "active",
    source: row.source || "footer",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ================= USERS =================
export const users = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const cleanEmail = (data.email || "").trim().toLowerCase();
    
    const stmt = db.prepare(`
      INSERT INTO users (
        id, name, email, provider, is_verified, password, role, plan, 
        subscription_status, email_verified, account_status, last_login, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name || "",
      cleanEmail,
      data.provider || "email",
      data.isVerified !== false ? 1 : 0,
      data.password || null,
      data.role || "user",
      data.plan || "FREE",
      data.subscriptionStatus || "inactive",
      data.emailVerified ? 1 : 0,
      data.accountStatus || "active",
      data.lastLogin || null,
      now,
      now
    );

    return this.findById(id);
  },

  async findOne(query) {
    const keys = Object.keys(query);
    if (keys.length === 0) return null;

    const whereClauses = [];
    const values = [];

    for (const key of keys) {
      if (key === "email") {
        whereClauses.push("email = ?");
        values.push(query[key].trim().toLowerCase());
      } else if (key === "id") {
        whereClauses.push("id = ?");
        values.push(query[key]);
      } else {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        whereClauses.push(`${dbKey} = ?`);
        values.push(query[key]);
      }
    }

    const stmt = db.prepare(`SELECT * FROM users WHERE ${whereClauses.join(" AND ")} LIMIT 1`);
    const row = stmt.get(...values);
    return mapUserFromDb(row);
  },

  async findById(id) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    const row = stmt.get(id);
    return mapUserFromDb(row);
  },

  async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    const row = stmt.get(cleanEmail);
    return mapUserFromDb(row);
  },

  async update(id, data) {
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    if (keys.length === 0) return this.findById(id);

    const setClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      setClauses.push(`${dbKey} = ?`);
      let val = data[key];
      if (key === "email" && val) val = val.trim().toLowerCase();
      if (typeof val === "boolean") val = val ? 1 : 0;
      values.push(val);
    }

    const now = new Date().toISOString();
    setClauses.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  },

  async findOneAndUpdate(query, data) {
    const user = await this.findOne(query);
    if (!user) return null;
    return this.update(user.id, data);
  },

  async count() {
    const stmt = db.prepare("SELECT count(*) as count FROM users");
    const row = stmt.get();
    return row.count;
  },
};

// ================= RESUMES =================
export const resumes = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const payloadStr = JSON.stringify(data.payload || {});

    const stmt = db.prepare(`
      INSERT INTO resumes (id, user_id, payload, title, premium, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.userId,
      payloadStr,
      data.title || "",
      data.premium ? 1 : 0,
      now,
      now
    );

    return this.findById(id);
  },

  async find(query = {}) {
    const keys = Object.keys(query);
    const whereClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      whereClauses.push(`${dbKey} = ?`);
      values.push(query[key]);
    }

    let sql = "SELECT * FROM resumes";
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    sql += " ORDER BY created_at DESC";

    const stmt = db.prepare(sql);
    const rows = stmt.all(...values);
    return rows.map(mapResumeFromDb);
  },

  async findById(id) {
    const stmt = db.prepare("SELECT * FROM resumes WHERE id = ?");
    const row = stmt.get(id);
    return mapResumeFromDb(row);
  },

  async findOne(query) {
    const keys = Object.keys(query);
    if (keys.length === 0) return null;

    const whereClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      whereClauses.push(`${dbKey} = ?`);
      values.push(query[key]);
    }

    const stmt = db.prepare(`SELECT * FROM resumes WHERE ${whereClauses.join(" AND ")} LIMIT 1`);
    const row = stmt.get(...values);
    return mapResumeFromDb(row);
  },

  async update(id, data) {
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    if (keys.length === 0) return this.findById(id);

    const setClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      setClauses.push(`${dbKey} = ?`);
      let val = data[key];
      if (key === "payload") val = JSON.stringify(val);
      if (typeof val === "boolean") val = val ? 1 : 0;
      values.push(val);
    }

    const now = new Date().toISOString();
    setClauses.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`UPDATE resumes SET ${setClauses.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  },

  async findOneAndDelete(query) {
    const resume = await this.findOne(query);
    if (!resume) return null;
    const stmt = db.prepare("DELETE FROM resumes WHERE id = ?");
    stmt.run(resume.id);
    return resume;
  },

  async count() {
    const stmt = db.prepare("SELECT count(*) as count FROM resumes");
    const row = stmt.get();
    return row.count;
  },

  async countByUserId(userId) {
    const stmt = db.prepare("SELECT count(*) as count FROM resumes WHERE user_id = ?");
    const row = stmt.get(userId);
    return row.count;
  },
};

// ================= PAYMENTS =================
export const payments = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO payments (id, user_id, order_id, payment_id, amount, currency, plan, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.userId,
      data.orderId || null,
      data.paymentId || null,
      data.amount || 0,
      data.currency || "INR",
      data.plan || "PRO",
      data.status || "paid",
      now,
      now
    );

    return this.findById(id);
  },

  async find(query = {}) {
    const keys = Object.keys(query);
    const whereClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      whereClauses.push(`${dbKey} = ?`);
      values.push(query[key]);
    }

    let sql = "SELECT * FROM payments";
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    sql += " ORDER BY created_at DESC";

    const stmt = db.prepare(sql);
    const rows = stmt.all(...values);
    return rows.map(mapPaymentFromDb);
  },

  async findById(id) {
    const stmt = db.prepare("SELECT * FROM payments WHERE id = ?");
    const row = stmt.get(id);
    return mapPaymentFromDb(row);
  },

  async findOne(query) {
    const keys = Object.keys(query);
    if (keys.length === 0) return null;

    const whereClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      whereClauses.push(`${dbKey} = ?`);
      values.push(query[key]);
    }

    const stmt = db.prepare(`SELECT * FROM payments WHERE ${whereClauses.join(" AND ")} LIMIT 1`);
    const row = stmt.get(...values);
    return mapPaymentFromDb(row);
  },

  async upsert(query, data) {
    const existing = await this.findOne(query);
    const now = new Date().toISOString();

    if (existing) {
      const updateData = { ...data, updatedAt: now };
      await this.update(existing.id, updateData);
      return this.findById(existing.id);
    }

    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO payments (id, user_id, order_id, payment_id, amount, currency, plan, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      query.userId || data.userId || null,
      query.orderId || data.orderId || null,
      query.paymentId || data.paymentId || null,
      data.amount || 0,
      data.currency || "INR",
      data.plan || "PRO",
      data.status || "paid",
      now,
      now
    );

    return this.findById(id);
  },

  async update(id, data) {
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    if (keys.length === 0) return this.findById(id);

    const setClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      setClauses.push(`${dbKey} = ?`);
      let val = data[key];
      if (typeof val === "boolean") val = val ? 1 : 0;
      values.push(val);
    }

    const now = new Date().toISOString();
    setClauses.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const stmt = db.prepare(`UPDATE payments SET ${setClauses.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }
};

// ================= SUBSCRIBERS =================
export const subscribers = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const email = (data.email || "").trim().toLowerCase();

    const stmt = db.prepare(`
      INSERT INTO subscribers (id, email, name, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      email,
      data.name || "",
      data.status || "active",
      data.source || "footer",
      now,
      now
    );

    return this.findOne({ email });
  },

  async findOne(query) {
    const keys = Object.keys(query);
    if (keys.length === 0) return null;

    const whereClauses = [];
    const values = [];

    for (const key of keys) {
      if (key === "email") {
        whereClauses.push("email = ?");
        values.push(query[key].trim().toLowerCase());
      } else {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        whereClauses.push(`${dbKey} = ?`);
        values.push(query[key]);
      }
    }

    const stmt = db.prepare(`SELECT * FROM subscribers WHERE ${whereClauses.join(" AND ")} LIMIT 1`);
    const row = stmt.get(...values);
    return mapSubscriberFromDb(row);
  },

  async update(email, data) {
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    if (keys.length === 0) return this.findOne({ email });

    const setClauses = [];
    const values = [];

    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      setClauses.push(`${dbKey} = ?`);
      let val = data[key];
      if (typeof val === "boolean") val = val ? 1 : 0;
      values.push(val);
    }

    const now = new Date().toISOString();
    setClauses.push("updated_at = ?");
    values.push(now);
    
    const cleanEmail = email.trim().toLowerCase();
    values.push(cleanEmail);

    const stmt = db.prepare(`UPDATE subscribers SET ${setClauses.join(", ")} WHERE email = ?`);
    stmt.run(...values);

    return this.findOne({ email });
  },
};

export { db as database };

export default {
  users,
  resumes,
  payments,
  subscribers,
  database: db,
  isUsingSqlite,
  isUsingPersistentStorage,
};