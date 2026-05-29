import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import dns from "dns";
import { createServer } from "net";

// DB
import connectDB from "./config/db.js";

// ROUTES
import authRoutes from "./routes/auth.js";
import resumeRoutes from "./routes/resume.js";
import paymentRoutes from "./routes/payment.js";
import aiRoutes from "./routes/ai.js";
import adminRoutes from "./routes/admin.js";

// ================= ENV =================
dotenv.config({ override: true });

// ================= DNS FIX FOR MONGODB ATLAS =================
dns.setDefaultResultOrder("ipv4first");

const app = express();

// ================= SECURITY + MIDDLEWARE =================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

const isDev = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (isDev) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked the request from ${origin}`)
      );
    },
    credentials: true,
  })
);

app.use(express.json());

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Resume PRO Backend Running");
});

// ================= HEALTH CHECK =================
app.get("/api/test", (req, res) => {
  res.json({
    status: "success",
    message: "Backend working ✅",
    time: new Date(),
  });
});

// ================= API ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);

// ================= 404 HANDLER =================
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found ❌",
    path: req.originalUrl,
  });
});

// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err.stack);

  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

// ================= AUTO-FIND FREE PORT =================
const findFreePort = (startPort = 5000, maxAttempts = 20) => {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > startPort + maxAttempts) {
        reject(
          new Error(
            `No free ports available between ${startPort} and ${
              startPort + maxAttempts
            }`
          )
        );
        return;
      }

      const server = createServer();

      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          tryPort(port + 1);
        } else {
          reject(err);
        }
      });

      server.once("listening", () => {
        server.close();
        resolve(port);
      });

      server.listen(port, "0.0.0.0");
    };

    tryPort(startPort);
  });
};

// ================= START SERVER =================
const startServer = async () => {
  try {
    // CONNECT DATABASE
    await connectDB();

    const desiredPort = parseInt(process.env.PORT || "5000", 10);

    const port = await findFreePort(desiredPort);

    app.listen(port, "0.0.0.0", () => {
      console.log(`\n✅ Server running on http://localhost:${port}`);
      console.log(`📡 API Base: http://localhost:${port}/api`);
      console.log(`✅ MongoDB Connected Successfully\n`);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }
};

startServer();