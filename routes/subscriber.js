import express from "express";
import { z } from "zod";
import asyncHandler from "../middleware/asyncHandler.js";
import { validateBody } from "../middleware/validate.js";
import { subscribers } from "../lib/db.js";
import { sendSubscriptionConfirmationEmail } from "../email/index.js";

const router = express.Router();

const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

// Subscribe - public endpoint
router.post(
  "/subscribe",
  validateBody(subscribeSchema),
  asyncHandler(async (req, res) => {
    const { email, name } = req.body;

    // Check if already subscribed
    const existing = await subscribers.findOne({ email: email.toLowerCase() });
    if (existing) {
      if (existing.status === "active") {
        return res.status(409).json({ error: "Email already subscribed" });
      }
      // Reactivate unsubscribed/bounced
      await subscribers.update(email, { status: "active", name: name || "" });
      return res.json({ message: "Subscription reactivated" });
    }

    // Create new subscriber
    await subscribers.create({
      email: email.toLowerCase(),
      name: name || "",
      status: "active",
      source: "footer",
    });

    // Send confirmation email (best-effort)
    try {
      await sendSubscriptionConfirmationEmail({ toEmail: email, name: name || "" });
    } catch (e) {
      console.error("Failed to send subscription confirmation:", e.message);
    }

    return res.json({ message: "Subscribed successfully" });
  })
);

// Unsubscribe
router.post(
  "/unsubscribe",
  validateBody(subscribeSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    const existing = await subscribers.findOne({ email: email.toLowerCase() });
    if (!existing) {
      return res.json({ message: "Unsubscribed" });
    }

    await subscribers.update(email, { status: "unsubscribed" });

    return res.json({ message: "Unsubscribed" });
  })
);

export default router;