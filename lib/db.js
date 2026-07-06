// lib/db.js - Supabase PostgreSQL Database Interface
import { v4 as uuidv4 } from "uuid";
import supabaseAdmin from "../config/supabase.js";

export function isUsingSqlite() { return false; }
export function isUsingPersistentStorage() { return true; }

// ================= USERS =================
export const users = {
  async create(data) {
    const id = uuidv4();
    const cleanEmail = (data.email || "").trim().toLowerCase();
    
    const dbData = {
      id,
      name: data.name || "",
      email: cleanEmail,
      provider: data.provider || "email",
      is_verified: data.isVerified !== false,
      password: data.password || null,
      role: data.role || "user",
      plan: data.plan || "FREE",
      subscription_status: data.subscriptionStatus || "inactive",
      email_verified: data.emailVerified || false,
      account_status: data.accountStatus || "active",
      last_login: data.lastLogin || null,
      email_otp_hash: data.emailOtpHash || null,
      email_otp_expires_at: data.emailOtpExpiresAt || null,
      email_otp_attempts: data.emailOtpAttempts || 0,
      email_otp_last_sent_at: data.emailOtpLastSentAt || null,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("users")
      .insert([dbData])
      .select()
      .single();

    if (error) throw error;
    return this.mapUser(inserted);
  },

  mapUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || "",
      email: row.email,
      provider: row.provider || "email",
      isVerified: row.is_verified,
      password: row.password,
      role: row.role || "user",
      plan: row.plan || "FREE",
      subscriptionStatus: row.subscription_status || "inactive",
      emailVerified: row.email_verified,
      accountStatus: row.account_status || "active",
      lastLogin: row.last_login,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      emailOtpHash: row.email_otp_hash,
      emailOtpExpiresAt: row.email_otp_expires_at,
      emailOtpAttempts: row.email_otp_attempts,
      emailOtpLastSentAt: row.email_otp_last_sent_at,
      passwordResetOtpHash: row.password_reset_otp_hash,
      passwordResetOtpExpiresAt: row.password_reset_otp_expires_at,
      passwordResetOtpAttempts: row.password_reset_otp_attempts,
      passwordResetOtpLastSentAt: row.password_reset_otp_last_sent_at,
      phone: row.phone,
      bio: row.bio,
      location: row.location,
      profession: row.profession
    };
  },

  async findOne(query) {
    let q = supabaseAdmin.from("users").select("*");
    for (const key of Object.keys(query)) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      q = q.eq(dbKey, query[key]);
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return this.mapUser(data);
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return this.mapUser(data);
  },

  async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();
    if (error) throw error;
    return this.mapUser(data);
  },

  async update(id, data) {
    const dbData = {};
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbData[dbKey] = data[key];
      }
    }
    const { data: updated, error } = await supabaseAdmin
      .from("users")
      .update(dbData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapUser(updated);
  },

  async findOneAndUpdate(query, data) {
    const user = await this.findOne(query);
    if (!user) return null;
    return this.update(user.id, data);
  },

  async count() {
    const { count, error } = await supabaseAdmin
      .from("users")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return count;
  },
};

// ================= RESUMES =================
export const resumes = {
  async create(data) {
    const id = uuidv4();
    const dbData = {
      id,
      user_id: data.userId,
      payload: data.payload || {},
      title: data.title || "",
      premium: Boolean(data.premium),
    };
    const { data: inserted, error } = await supabaseAdmin
      .from("resumes")
      .insert([dbData])
      .select()
      .single();
    if (error) throw error;
    return this.mapResume(inserted);
  },

  mapResume(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      payload: row.payload,
      title: row.title || "",
      premium: row.premium,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async find(query = {}) {
    let q = supabaseAdmin.from("resumes").select("*");
    for (const key of Object.keys(query)) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      q = q.eq(dbKey, query[key]);
    }
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(this.mapResume);
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("resumes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return this.mapResume(data);
  },

  async findOne(query) {
    let q = supabaseAdmin.from("resumes").select("*");
    for (const key of Object.keys(query)) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      q = q.eq(dbKey, query[key]);
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return this.mapResume(data);
  },

  async update(id, data) {
    const dbData = {};
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbData[dbKey] = data[key];
      }
    }
    const { data: updated, error } = await supabaseAdmin
      .from("resumes")
      .update(dbData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapResume(updated);
  },

  async findOneAndDelete(query) {
    const resume = await this.findOne(query);
    if (!resume) return null;
    const { error } = await supabaseAdmin
      .from("resumes")
      .delete()
      .eq("id", resume.id);
    if (error) throw error;
    return resume;
  },

  async count() {
    const { count, error } = await supabaseAdmin
      .from("resumes")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return count;
  },

  async countByUserId(userId) {
    const { count, error } = await supabaseAdmin
      .from("resumes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count;
  },
};

// ================= PAYMENTS =================
export const payments = {
  async create(data) {
    const id = uuidv4();
    const dbData = {
      id,
      user_id: data.userId,
      order_id: data.orderId || null,
      payment_id: data.paymentId || null,
      amount: data.amount || 0,
      currency: data.currency || "INR",
      plan: data.plan || "PRO",
      status: data.status || "paid",
    };
    const { data: inserted, error } = await supabaseAdmin
      .from("payments")
      .insert([dbData])
      .select()
      .single();
    if (error) throw error;
    return this.mapPayment(inserted);
  },

  mapPayment(row) {
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
      updatedAt: row.updated_at,
    };
  },

  async find(query = {}) {
    let q = supabaseAdmin.from("payments").select("*");
    for (const key of Object.keys(query)) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      q = q.eq(dbKey, query[key]);
    }
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(this.mapPayment);
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return this.mapPayment(data);
  },

  async findOne(query) {
    let q = supabaseAdmin.from("payments").select("*");
    for (const key of Object.keys(query)) {
      const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      q = q.eq(dbKey, query[key]);
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return this.mapPayment(data);
  },

  async upsert(query, data) {
    const existing = await this.findOne(query);
    if (existing) {
      return this.update(existing.id, data);
    }
    return this.create({ ...query, ...data });
  },

  async update(id, data) {
    const dbData = {};
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbData[dbKey] = data[key];
      }
    }
    const { data: updated, error } = await supabaseAdmin
      .from("payments")
      .update(dbData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapPayment(updated);
  }
};

// ================= SUBSCRIBERS =================
export const subscribers = {
  async create(data) {
    const id = uuidv4();
    const email = (data.email || "").trim().toLowerCase();
    const dbData = {
      id,
      email,
      name: data.name || "",
      status: data.status || "active",
      source: data.source || "footer",
    };
    const { data: inserted, error } = await supabaseAdmin
      .from("subscribers")
      .insert([dbData])
      .select()
      .single();
    if (error) throw error;
    return this.mapSubscriber(inserted);
  },

  mapSubscriber(row) {
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name || "",
      status: row.status || "active",
      source: row.source || "footer",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async findOne(query) {
    let q = supabaseAdmin.from("subscribers").select("*");
    for (const key of Object.keys(query)) {
      if (key === "email") {
        q = q.eq("email", query[key].trim().toLowerCase());
      } else {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        q = q.eq(dbKey, query[key]);
      }
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return this.mapSubscriber(data);
  },

  async update(email, data) {
    const dbData = {};
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        dbData[dbKey] = data[key];
      }
    }
    const cleanEmail = email.trim().toLowerCase();
    const { data: updated, error } = await supabaseAdmin
      .from("subscribers")
      .update(dbData)
      .eq("email", cleanEmail)
      .select()
      .single();
    if (error) throw error;
    return this.mapSubscriber(updated);
  },
};

export { supabaseAdmin as database };

export default {
  users,
  resumes,
  payments,
  subscribers,
  database: supabaseAdmin,
  isUsingSqlite,
  isUsingPersistentStorage,
};