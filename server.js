import app from "./src/app.js";

// Server bootstrap kept in root for backward-compatible entrypoint
const isDev = process.env.NODE_ENV !== "production";

const desiredPort = parseInt(process.env.PORT || "5000", 10);

app
  .listen(desiredPort, "0.0.0.0", () => {
    console.log(`\n✅ Server running on port ${desiredPort}`);
    console.log(`📡 API Base: http://localhost:${desiredPort}/api\n`);

    if (isDev) {
      console.log("🛠️  DEV mode: CORS is permissive.");
    } else {
      console.log("🚀 PRODUCTION mode: Enforcing secure CORS and optimizations.");
    }
  })
  .on("error", (err) => {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  });

