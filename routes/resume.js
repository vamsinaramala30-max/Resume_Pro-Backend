import express from "express";
import { resumes } from "../lib/db.js";
import authMiddleware from "../middleware/auth.js";
import isPremium from "../middleware/isPremium.js";

const router = express.Router();

// Free save endpoint
router.post("/save", authMiddleware, async (req, res) => {
  const resume = await resumes.create({
    userId: req.user.id,
    payload: req.body?.payload ?? req.body,
    title: req.body?.title ?? "",
    premium: Boolean(req.body?.premium),
  });

  res.json({ message: "Saved to Cloud", resume });
});

// Premium save endpoint - requires subscription
router.post("/save-premium", authMiddleware, isPremium, async (req, res) => {
  const resume = await resumes.create({
    userId: req.user.id,
    payload: req.body?.payload ?? req.body,
    title: req.body?.title ?? "",
    premium: true,
  });

  res.json({ message: "Premium resume saved to Cloud", resume });
});

// Get only the authenticated user's saved resumes
router.get("/me", authMiddleware, async (req, res) => {
  const data = await resumes.find({ userId: req.user.id });
  res.json(data);
});

// Delete only if the resume belongs to the authenticated user
router.delete("/:id", authMiddleware, async (req, res) => {
  const deleted = await resumes.findOneAndDelete({
    id: req.params.id,
    userId: req.user.id,
  });

  if (!deleted) return res.status(404).json({ error: "Resume not found" });
  res.json({ message: "Deleted" });
});


export default router;