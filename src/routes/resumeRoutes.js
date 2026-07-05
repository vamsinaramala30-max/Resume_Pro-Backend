import express from "express";
import { z } from "zod";
import Resume from "../../models/resume.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

const saveSchema = z
  .object({
    title: z.string().max(200).optional().default(""),
    premium: z.boolean().optional().default(false),
    payload: z.any().optional(),
  })
  .passthrough();

// Keep backward compatibility: existing clients may send payload in root body.
router.post("/save", auth, (req, res, next) => {
  try {
    // If payload provided, accept it. Otherwise accept entire body as payload.
    const normalized = {
      title: req.body?.title,
      premium: req.body?.premium,
      payload: req.body?.payload ?? req.body,
    };

    const parsed = saveSchema.safeParse(normalized);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    return Promise.resolve()
      .then(async () => {
        const resume = new Resume({
          userId: req.user.id,
          payload: parsed.data.payload,
          title: parsed.data.title,
          premium: Boolean(parsed.data.premium),
        });

        await resume.save();
        return res.json({ success: true, message: "Saved to Cloud ✅", resume });
      })
      .catch(next);
  } catch (err) {
    return next(err);
  }
});

router.get("/me", auth, async (req, res, next) => {
  try {
    const data = await Resume.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, resumes: data });
  } catch (err) {
    return next(err);
  }
});

router.delete("/:id", auth, async (req, res, next) => {
  try {
    const idSchema = z.string().min(1);
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const deleted = await Resume.findOneAndDelete({
      _id: parsedId.data,
      userId: req.user.id,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Resume not found" });
    }

    return res.json({ success: true, message: "Deleted ✅" });
  } catch (err) {
    return next(err);
  }
});

export default router;

