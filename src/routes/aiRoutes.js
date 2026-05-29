import express from "express";
import { z } from "zod";

const router = express.Router();

const suggestSchema = z
  .object({
    text: z.string().min(1).max(5000),
  })
  .strict();

router.post("/suggest", (req, res) => {
  const parsed = suggestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  // Demo placeholder
  return res.json({ success: true, result: "✨ Improved: " + parsed.data.text });
});

export default router;

