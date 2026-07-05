import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import dotenv from "dotenv";

import { validateEnv } from "./config/env.js";
import connectDB from "./config/db.js";

dotenv.config({ path: ".env.local" });


import authRoutes from "../src/routes/authRoutes.js";
import resumeRoutes from "../src/routes/resumeRoutes.js";
import paymentRoutes from "../src/routes/paymentRoutes.js";
import aiRoutes from "../src/routes/aiRoutes.js";
import adminRoutes from "../src/routes/adminRoutes.js";

import { notFound } from "./errors/notFound.js";
import { errorHandler } from "./errors/errorHandler.js";

validateEnv();


const app = express();

const isDev = process.env.NODE_ENV !== "production";

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://vamsinaramala30-max-startfixvk.vercel.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isDev) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow dynamic Vercel preview environments
      if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked the request from ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: process.env.JSON_LIMIT || "1mb" }));
app.use(mongoSanitize());
app.use(xss());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX || 200),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

await connectDB();

app.use("/api/auth", authRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("🚀 Resume PRO Backend Running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), environment: process.env.NODE_ENV });
});

app.get("/api/test", (req, res) => {
  res.json({
    status: "success",
    message: "Backend working ✅",
    time: new Date(),
  });
});

app.use(notFound);
app.use(errorHandler);

export default app;

