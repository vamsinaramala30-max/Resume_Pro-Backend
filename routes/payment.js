import express from "express";
import crypto from "crypto";
import authMiddleware from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { z } from "zod";
import AppError from "../shared/errors/AppError.js";

import { users, payments } from "../lib/db.js";

import { getRazorpayClient, getRazorpayWebhookSecret, isRazorpayConfigured } from "../config/razorpay.js";
import { addDaysFromNow, getPlanFromBody } from "../utils/subscriptions.js";
import { getEffectiveUserResponse } from "../utils/premium.js";

import logEvent from "../shared/logging/logger.js";
import rawBodyJsonMiddleware from "../middleware/rawBodyJson.js";


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

// ===== Create order =====
const createOrderSchema = z.object({
  plan: z.string().min(2).max(10),
});

router.post(
  "/create-order",
  requireRazorpay,
  authMiddleware,
  validateBody(createOrderSchema),
  async (req, res, next) => {
    try {
      const user = await users.findById(req.user.id);
      if (!user) {
        throw new AppError({
          statusCode: 401,
          code: "UNAUTHENTICATED",
          message: "User not found",
        });
      }

      const plan = getPlanFromBody(req.body.plan);
      if (!plan) {
        throw new AppError({ statusCode: 400, code: "INVALID_PLAN", message: "Invalid plan" });
      }

      if (plan !== "PRO") {
        throw new AppError({
          statusCode: 400,
          code: "PLAN_NOT_SUPPORTED",
          message: "Only PRO is supported at the moment",
        });
      }

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

// ===== Verify payment after checkout =====
const verifySchema = z.object({
  order_id: z.string().min(1),
  payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  plan: z.string().min(2).max(10).optional(),
});

router.post(
  "/verify",
  requireRazorpay,
  authMiddleware,
  validateBody(verifySchema),
  async (req, res, next) => {
    try {
      const { order_id, payment_id, razorpay_signature } = req.body;

      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!secret) {
        throw new AppError({ statusCode: 500, code: "CONFIG_ERROR", message: "RAZORPAY_KEY_SECRET missing" });
      }

      const body = `${order_id}|${payment_id}`;
      const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

      const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
      if (!valid) {
        throw new AppError({
          statusCode: 400,
          code: "INVALID_SIGNATURE",
          message: "Razorpay signature verification failed",
        });
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

      return res.json({ ok: true, status: "verified", plan, subscriptionEndDate });
    } catch (err) {
      next(err);
    }
  }
);

// ===== Razorpay webhook =====
router.post(
  "/webhook",
  rawBodyJsonMiddleware,
  async (req, res, next) => {
    try {
      const webhookSecret = getRazorpayWebhookSecret();
      const razorpaySig = req.headers["x-razorpay-signature"];
      const raw = req.rawBody;

      if (!raw) {
        throw new AppError({ statusCode: 500, code: "WEBHOOK_RAW_BODY_MISSING", message: "Raw body not available" });
      }

      if (!webhookSecret) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[razorpay:webhook] RAZORPAY_WEBHOOK_SECRET missing; skipping webhook signature validation."
          );
        }

        return res.status(200).json({ received: true, skipped: true });
      }

      if (!razorpaySig) {
        throw new AppError({ statusCode: 400, code: "INVALID_WEBHOOK", message: "Missing webhook signature" });
      }

      const expected = crypto.createHmac("sha256", webhookSecret).update(raw).digest("hex");
      const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpaySig)));

      if (!valid) {
        throw new AppError({ statusCode: 400, code: "INVALID_WEBHOOK_SIGNATURE", message: "Webhook signature invalid" });
      }

      const payload = JSON.parse(raw.toString("utf8"));
      const eventType = payload?.event || payload?.payload?.event;
      const event = payload?.payload || payload;

      const now = new Date();
      const subscriptionEndDate = addDaysFromNow(30);
      const plan = "PRO";

      const paymentId = event?.payment?.entity?.id || event?.payment?.entity?.payment_id || event?.payment?.id || event?.payment_id;

      const userId =
        event?.payment?.entity?.notes?.userId ||
        event?.payment?.entity?.notes?.user_id ||
        event?.subscription?.entity?.notes?.userId ||
        event?.subscription?.entity?.notes?.user_id;

      if (eventType === "payment.captured" || eventType === "payment.authorized") {
        if (paymentId) {
          await payments.upsert({ paymentId }, { plan, status: "verified" });
        }

        if (userId) {
          await users.update(userId, {
            plan,
            subscriptionStatus: "active",
            subscriptionStartDate: now,
            subscriptionEndDate,
          });
        }

        return res.status(200).json({ received: true, verified: true, handled: true });
      }

      if (
        eventType === "subscription.charged_successfully" ||
        eventType === "subscription.activated" ||
        eventType === "subscription.updated"
      ) {
        if (userId) {
          await users.update(userId, {
            plan,
            subscriptionStatus: "active",
            subscriptionStartDate: now,
            subscriptionEndDate,
          });
        }

        return res.status(200).json({ received: true, verified: true, handled: true });
      }

      if (
        eventType === "subscription.canceled" ||
        eventType === "subscription.halted" ||
        eventType === "subscription.expired"
      ) {
        if (userId) {
          await users.update(userId, { subscriptionStatus: "inactive" });
        }

        return res.status(200).json({ received: true, verified: true, handled: true });
      }

      logEvent({ level: "info", message: `[razorpay:webhook] Unhandled event: ${eventType}` });
      return res.status(200).json({ received: true, verified: true, handled: false });
    } catch (err) {
      next(err);
    }
  }
);

// ===== Me =====
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await users.findById(req.user.id);
    return res.json({
      ok: true,
      ...getEffectiveUserResponse(user),
      subscriptionEndDate: user?.subscriptionEndDate || null,
    });
  } catch (err) {
    next(err);
  }
});

// ===== Payment history =====
router.get("/payments/me", authMiddleware, async (req, res, next) => {
  try {
    const userPayments = await payments.find({ userId: req.user.id });
    return res.json({ ok: true, payments: userPayments });
  } catch (err) {
    next(err);
  }
});

// ===== Back-compat endpoint for the existing frontend =====
router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const user = await users.findById(req.user.id);
    const end = user?.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
    const now = new Date();

    const premium =
      user?.plan === "PRO" &&
      user?.subscriptionStatus === "active" &&
      (!end || end.getTime() > now.getTime());

    return res.json({
      ok: true,
      userId: req.user.id,
      status: premium ? "success" : "inactive",
      premium,
      plan: user?.plan || "FREE",
      subscriptionEndDate: user?.subscriptionEndDate || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;