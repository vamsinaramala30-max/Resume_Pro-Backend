import express from "express";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

// Demo endpoint: explicitly not production premium activation.
router.post("/", auth, async (req, res) => {
  const isDemo = process.env.PAYMENT_DEMO === "true" || process.env.NODE_ENV !== "production";

  if (!isDemo) {
    return res.status(501).json({
      success: false,
      message: "Payment is not configured. Enable demo mode with PAYMENT_DEMO=true for local usage.",
    });
  }

  return res.json({
    success: true,
    ok: true,
    userId: req.user.id,
    amount: 99,
    status: "success",
    premium: true,
    demo: true,
  });
});

export default router;

