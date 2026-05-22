import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "net";

// DB
import connectDB from "./config/db.js";

// ROUTES
import authRoutes from "./routes/auth.js";
import resumeRoutes from "./routes/resume.js";
import paymentRoutes from "./routes/payment.js";
import aiRoutes from "./routes/ai.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

const app = express();

// ================= SECURITY + MIDDLEWARE =================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean)

const isDev = process.env.NODE_ENV !== 'production'

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (isDev) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS blocked the request from ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())

// ================= CONNECT DATABASE =================
connectDB();

// ================= API ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🚀 Resume PRO Backend Running");
});

// ================= HEALTH CHECK =================
app.get("/api/test", (req, res) => {
  res.json({
    status: "success",
    message: "Backend working ✅",
    time: new Date()
  });
});

// ================= 404 HANDLER =================
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found ❌",
    path: req.originalUrl
  });
});

// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err.stack);

  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

// ================= AUTO-FIND FREE PORT =================
const findFreePort = (startPort = 5000, maxAttempts = 20) => {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > startPort + maxAttempts) {
        reject(new Error(`No free ports available between ${startPort} and ${startPort + maxAttempts}`));
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
const desiredPort = parseInt(process.env.PORT || "5000", 10);

findFreePort(desiredPort)
  .then((port) => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`\n✅ Server running on http://localhost:${port}`);
      console.log(`📡 API Base: http://localhost:${port}/api\n`);
      
      // Write port to file for frontend discovery
      try {
        import("fs").then(({ writeFileSync }) => {
          writeFileSync(new URL("../backend.port", import.meta.url), String(port), "utf-8");
        });
      } catch (e) {
        // Silently fail if we can't write the port file
      }
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  });