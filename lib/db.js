// src/lib/db.js
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, "..", "data", "vkpro.db");

let db = null;

export function isUsingSqlite() { return false; }
export function isUsingPersistentStorage() { return false; }

// In-memory persistent stores
const inMemoryUsers = new Map();
const inMemoryResumes = new Map();
const inMemoryPayments = new Map();
const inMemorySubscribers = new Map();

// ================= USERS =================
export const users = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const cleanEmail = (data.email || "").trim().toLowerCase();
    
    const user = {
      id,
      name: data.name || "",
      email: cleanEmail,
      password: data.password || null,
      provider: data.provider || "email",
      isVerified: data.isVerified !== false,
      role: data.role || "user",
      plan: data.plan || "FREE",
      subscriptionStatus: data.subscriptionStatus || "inactive",
      emailVerified: data.emailVerified || false,
      accountStatus: data.accountStatus || "active",
      lastLogin: data.lastLogin || null,
      createdAt: now,
      updatedAt: now,
      ...data,
      email: cleanEmail // Enforce correct format
    };
    inMemoryUsers.set(id, user);
    return { ...user };
  },

  async findOne(query) {
    for (const user of inMemoryUsers.values()) {
      let match = true;
      for (const key in query) {
        const queryVal = typeof query[key] === 'string' ? query[key].toLowerCase() : query[key];
        const userVal = typeof user[key] === 'string' ? user[key].toLowerCase() : user[key];
        if (userVal !== queryVal) {
          match = false;
          break;
        }
      }
      if (match) return { ...user };
    }
    return null;
  },

  async findById(id) {
    const user = inMemoryUsers.get(id);
    return user ? { ...user } : null;
  },

  async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    for (const user of inMemoryUsers.values()) {
      if (user.email === cleanEmail) return { ...user };
    }
    return null;
  },

  async update(id, data) {
    const existing = inMemoryUsers.get(id);
    if (!existing) throw new Error("User not found");
    
    // Filter undefined fields to protect the object structure
    const cleanUpdates = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );

    if (cleanUpdates.email) {
      cleanUpdates.email = cleanUpdates.email.trim().toLowerCase();
    }

    const updated = {
      ...existing,
      ...cleanUpdates,
      updatedAt: new Date().toISOString(),
    };
    inMemoryUsers.set(id, updated);
    return { ...updated };
  },

  async findOneAndUpdate(query, data) {
    const user = await this.findOne(query);
    if (!user) return null;
    return this.update(user.id, data);
  },

  async count() {
    return inMemoryUsers.size;
  },
};

// ================= RESUMES =================
export const resumes = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const resume = {
      id,
      userId: data.userId,
      payload: data.payload || {},
      title: data.title || "",
      premium: data.premium || false,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryResumes.set(id, resume);
    return { ...resume };
  },

  async find(query = {}) {
    const results = [];
    for (const resume of inMemoryResumes.values()) {
      let match = true;
      for (const key in query) {
        if (resume[key] !== query[key]) {
          match = false;
          break;
        }
      }
      if (match) results.push({ ...resume });
    }
    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findById(id) {
    const resume = inMemoryResumes.get(id);
    return resume ? { ...resume } : null;
  },

  async findOne(query) {
    for (const resume of inMemoryResumes.values()) {
      let match = true;
      for (const key in query) {
        if (resume[key] !== query[key]) {
          match = false;
          break;
        }
      }
      if (match) return { ...resume };
    }
    return null;
  },

  async update(id, data) {
    const existing = inMemoryResumes.get(id);
    if (!existing) throw new Error("Resume not found");
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    inMemoryResumes.set(id, updated);
    return { ...updated };
  },

  async findOneAndDelete(query) {
    const resume = await this.findOne(query);
    if (!resume) return null;
    inMemoryResumes.delete(resume.id);
    return resume;
  },

  async count() {
    return inMemoryResumes.size;
  },

  async countByUserId(userId) {
    let count = 0;
    for (const resume of inMemoryResumes.values()) {
      if (resume.userId === userId) count++;
    }
    return count;
  },
};

// ================= PAYMENTS =================
export const payments = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const payment = {
      id,
      userId: data.userId,
      orderId: data.orderId || null,
      paymentId: data.paymentId || null,
      amount: data.amount || 0,
      currency: data.currency || "INR",
      plan: data.plan || "PRO",
      status: data.status || "paid",
      createdAt: now,
      updatedAt: now,
    };
    inMemoryPayments.set(id, payment);
    return { ...payment };
  },

  async find(query = {}) {
    const results = [];
    for (const payment of inMemoryPayments.values()) {
      let match = true;
      for (const key in query) {
        if (payment[key] !== query[key]) {
          match = false;
          break;
        }
      }
      if (match) results.push({ ...payment });
    }
    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async findOne(query) {
    for (const payment of inMemoryPayments.values()) {
      let match = true;
      for (const key in query) {
        if (payment[key] !== query[key]) {
          match = false;
          break;
        }
      }
      if (match) return { ...payment };
    }
    return null;
  },

  async upsert(query, data) {
    const existing = await this.findOne(query);
    const now = new Date().toISOString();
    if (existing) {
      const updated = {
        ...existing,
        ...data,
        updatedAt: now,
      };
      inMemoryPayments.set(existing.id, updated);
      return { ...updated };
    }
    const newId = uuidv4();
    const newPayment = {
      id: newId,
      ...query,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryPayments.set(newId, newPayment);
    return { ...newPayment };
  },
};

// ================= SUBSCRIBERS =================
export const subscribers = {
  async create(data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const email = (data.email || "").trim().toLowerCase();
    const subscriber = {
      id,
      email,
      name: data.name || "",
      status: data.status || "active",
      source: data.source || "footer",
      createdAt: now,
      updatedAt: now,
    };
    inMemorySubscribers.set(email, subscriber);
    return { ...subscriber };
  },

  async findOne(query) {
    for (const subscriber of inMemorySubscribers.values()) {
      let match = true;
      for (const key in query) {
        const qVal = typeof query[key] === 'string' ? query[key].toLowerCase() : query[key];
        const sVal = typeof subscriber[key] === 'string' ? subscriber[key].toLowerCase() : subscriber[key];
        if (sVal !== qVal) {
          match = false;
          break;
        }
      }
      if (match) return { ...subscriber };
    }
    return null;
  },

  async update(email, data) {
    const key = email.trim().toLowerCase();
    const existing = inMemorySubscribers.get(key);
    if (!existing) throw new Error("Subscriber not found");
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    inMemorySubscribers.set(key, updated);
    return { ...updated };
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