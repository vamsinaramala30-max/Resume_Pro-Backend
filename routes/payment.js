import express from "express";
import auth from "../middleware/auth.js";

const router = express.Router();

// IMPORTANT: your frontend calls /api/payment (NOT /pay)
// NOTE: Payment model isn't implemented in this repo snapshot.
// This route returns a premium-flag simulation so premium UI can be demoed safely.
router.post("/", auth, async (req, res) => {
  try {
    res.json({
      ok: true,
      userId: req.user.id,
      amount: 99,
      status: "success",
      premium: true,
    });
  } catch {
    res.status(500).json({ msg: "Payment failed" });
  }
});

export default router;

