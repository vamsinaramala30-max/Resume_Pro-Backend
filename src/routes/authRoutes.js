import express from "express";
import { z } from "zod";
import { register, login } from "../controllers/authController.js";

const router = express.Router();

const registerSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(254),
    password: z.string().min(8).max(200),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
  })
  .strict();

router.post("/register", (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  req.body = parsed.data;
  return register(req, res, next);
});

router.post("/login", (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  req.body = parsed.data;
  return login(req, res, next);
});

export default router;

