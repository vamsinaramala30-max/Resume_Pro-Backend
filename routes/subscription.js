import express from "express";
import crypto from "crypto";
import authMiddleware from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { z } from "zod";
import AppError from "../shared/errors/AppError.js";

import { users, payments } from "../lib/db.js";

import { getRazorpayClient, getRazorpayWebhookSecret, isRazorpayConfigured } from "../config/razorpay.js";
import { addDaysFromNow, getPlanFromBody } from "../utils/subscriptions.js";
import { sendSubscriptionConfirmationEmail } from "../email/index.js";
import { getEffectiveUserResponse } from "../utils/premium.js";

const router = express.Router();
const razorpay = getRazorpayClient();

// Middleware to check if Razorpay is configured
function requireRazorpay(req, res, next) {
  if (!isRazorpayConfigured()) {
    return res.status(503).json({
      error: "PAYMENT_UNAVAILABLE",
      message: "Payment processing is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    });
  }
  next();
}

const createOrderSchema = z.object({
  plan: z.string().min(2).max(10),
});

// create-order
router.post(
  "/create-order",
  requireRazorpay,
  authMiddleware,
  validateBody(createOrderSchema),
  async (req, res, next) => {
    try {
      const user = await users.findById(req.user.id);
      if (!user) throw new AppError({ statusCode: 401, code: "UNAUTHENTICATED", message: "User not found" });

      const plan = getPlanFromBody(req.body.plan);
      if (!plan) throw new AppError({ statusCode: 400, code: "INVALID_PLAN", message: "Invalid plan" });

      // Only PRO is supported right now for activation, but TEAM reserved.
      if (plan !== "PRO") {
        throw new AppError({ statusCode: 400, code: "PLAN_NOT_SUPPORTED", message: "Only PRO is supported at the moment" });
      }

      // Amount in paise (Razorpay expects smallest currency unit)
      // TODO: replace with real pricing.
      const amountPaise = Number(process.env.PRO_PRICE_PAISE || "99900");
      const currency = process.env.RAZORPAY_CURRENCY || "INR";

      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency,
        receipt: `rcpt_${req.user.id}_${Date.now()}`,
        notes: { userId: req.user.id, plan },
      });

      return res.json({
        ok: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        plan,
      });
    } catch (err) {
      next(err);
    }
  }
);

const verifySchema = z.object({
  order_id: z.string().min(1),
  payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  plan: z.string().min(2).max(10).optional(),
});

// verify-payment
router.post(
  "/verify",
  requireRazorpay,
  authMiddleware,
  validateBody(verifySchema),
  async (req, res, next) => {
    try {
      const { order_id, payment_id, razorpay_signature } = req.body;

      // Verify signature server-side
      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!secret) throw new AppError({ statusCode: 500, code: "CONFIG_ERROR", message: "RAZORPAY_KEY_SECRET missing" });

      const body = `${order_id}|${payment_id}`;
      const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

      const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
      if (!valid) {
        throw new AppError({ statusCode: 400, code: "INVALID_SIGNATURE", message: "Razorpay signature verification failed" });
      }

      const plan = getPlanFromBody(req.body.plan) || "PRO";
      if (plan !== "PRO") {
        throw new AppError({ statusCode: 400, code: "PLAN_NOT_SUPPORTED", message: "Only PRO is supported at the moment" });
      }

      const now = new Date();
      const subscriptionEndDate = addDaysFromNow(30);

      // Upsert payment record
      await payments.upsert(
        { paymentId: payment_id },
        {
          userId: req.user.id,
          orderId: order_id,
          paymentId: payment_id,
          amount: Number(process.env.PRO_PRICE_PAISE || "99900"),
          currency: process.env.RAZORPAY_CURRENCY || "INR",
          plan,
          status: "verified",
        }
      );

      // Activate subscription
      await users.update(req.user.id, {
        plan,
        subscriptionStatus: "active",
        subscriptionStartDate: now,
        subscriptionEndDate,
      });

      // Send confirmation email (best-effort)
      const userEmail = (await users.findById(req.user.id)).email;
      if (userEmail) {
        await sendSubscriptionConfirmationEmail({ toEmail: userEmail, plan, subscriptionEndDate });
      }

      return res.json({ ok: true, status: "verified", plan, subscriptionEndDate });
    } catch (err) {
      next(err);
    }
  }
);

// webhook support (optional)
router.post(
  "/webhook",
  async (req, res, next) => {
    try {
      // NOTE: This requires raw body. Configure in server for production.
      // For now: signature verification is skipped if secret missing.
      const webhookSecret = getRazorpayWebhookSecret();
      const razorpaySig = req.headers["x-razorpay-signature"];

      if (!webhookSecret) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[razorpay:webhook] RAZORPAY_WEBHOOK_SECRET missing; skipping webhook signature validation.");
        }
        // Best-effort response
        return res.status(200).json({ received: true, skipped: true });
      }

      if (!razorpaySig) throw new AppError({ statusCode: 400, code: "INVALID_WEBHOOK", message: "Missing webhook signature" });

      // Expected signature: HMAC_SHA256(rawBody, webhookSecret)
      // If server isn't configured with raw body, verification may fail.
      const raw = req.rawBody;
      if (!raw) throw new AppError({ statusCode: 500, code: "WEBHOOK_RAW_BODY_MISSING", message: "Raw body not available" });

      const expected = crypto.createHmac("sha256", webhookSecret).update(raw).digest("hex");
      const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpaySig)));
      if (!valid) throw new AppError({ statusCode: 400, code: "INVALID_WEBHOOK_SIGNATURE", message: "Webhook signature invalid" });

      // TODO: handle events when secret is provided.
      // Example: payment.captured => mark verified / activate.

      return res.status(200).json({ received: true, verified: true });
    } catch (err) {
      next(err);
    }
  }
);

// me
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await users.findById(req.user.id);
    return res.json({ ok: true, ...getEffectiveUserResponse(user), subscriptionEndDate: user.subscriptionEndDate || null });
  } catch (err) {
    next(err);
  }
});

// payment history
router.get("/payments/me", authMiddleware, async (req, res, next) => {
  try {
    const userPayments = await payments.find({ userId: req.user.id });
    return res.json({ ok: true, payments: userPayments });
  } catch (err) {
    next(err);
  }
});

export default router;

