export * from './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import logEvent from './shared/logging/logger.js';
import { sanitizeInput } from './middleware/validate.js';
import errorHandler from './middleware/errorHandler.js';
import requestIdMiddleware from './middleware/requestId.js';
import requestLoggingMiddleware from './middleware/logging.js';

import { isSupabaseConfigured } from './config/supabase.js';
import { isRazorpayConfigured } from './config/razorpay.js';
import { isEmailConfigured } from './config/email.js';
import { printConfigStatus } from './config/env.js';

// ROUTES
import authRoutes from './routes/auth.js';
import resumeRoutes from './routes/resume.js';
import paymentRoutes from './routes/payment.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import subscriberRoutes from './routes/subscriber.js';
import contactRoutes from './routes/contact.js';

printConfigStatus();
const app = express();

// ================= SECURITY headers =================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.openai.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ================= CRITICAL HOOK ORDER FIX =================
// Razorpay webhooks need raw body parsing BEFORE express.json middleware captures payloads
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

app.use(sanitizeInput);

// Request tracing (requestId) + structured logging
app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);


// Security Analytics logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400 && req.path.includes('/auth')) {
      logEvent({
        level: 'warn',
        message: `Security Warning: ${req.method} ${req.path}`,
        extra: {
          ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          status: res.statusCode,
          userAgent: req.headers['user-agent'] || 'unknown',
          duration,
          requestId: req.requestId,
        }
      });
    }
  });
  next();
});


// ================= SERVICE STATUS LOGS =================
console.log(`[Status] Supabase: ${isSupabaseConfigured() ? 'Connected' : 'Disabled'}`);
console.log(`[Status] Razorpay: ${isRazorpayConfigured() ? 'Connected' : 'Disabled'}`);
console.log(`[Status] Email: ${isEmailConfigured() ? 'Connected' : 'Disabled'}`);

// ================= API PLUGINS ROUTES =================
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscribe', subscriberRoutes);
app.use('/api/contact', contactRoutes);

app.get('/', (req, res) => res.send('Resume PRO Backend Running'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      supabase: isSupabaseConfigured(),
      razorpay: isRazorpayConfigured(),
      email: isEmailConfigured()
    }
  });
});

app.get('/api/test', (req, res) => {
  res.json({ status: 'success', message: 'Backend working', time: new Date() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// Errors parsing boundary pipeline handler
app.use(errorHandler);

function toPort(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return fallback;
  if (n >= 65536) return fallback;
  return n;
}

function tryListenOnce(serverInstance, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      serverInstance.off('error', onError);
      serverInstance.off('listening', onListening);
    };

    serverInstance.once('error', onError);
    serverInstance.once('listening', onListening);

    serverInstance.listen(port, host);
  });
}

async function listenOnAvailablePort({ httpApp, startPort, host, maxTries = 50 }) {
  let port = startPort;

  for (let i = 0; i < maxTries; i++) {
    // createServer ensures we only bind once per attempt
    const serverInstance = (await import('http')).default.createServer(httpApp);
    try {
      await tryListenOnce(serverInstance, port, host);
      return { server: serverInstance, port };
    } catch (err) {
      if (err?.code === 'EADDRINUSE' || /EADDRINUSE/i.test(String(err?.message || ''))) {
        console.warn(`[server] Port ${port} already in use. Trying ${port + 1}...`);
        try { serverInstance.close(); } catch (_) { /* ignore */ }
        port = port + 1;
        continue;
      }

      try { serverInstance.close(); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  throw new Error(`Could not find an available port starting from ${startPort}`);
}

const host = process.env.HOST || '0.0.0.0';
const basePort = toPort(process.env.PORT, 5000);
const startedAt = Date.now();

let server;
let selectedPort;

const { default: http } = await import('http');
const result = await (async () => {
  let port = basePort;
  for (let i = 0; i < 50; i++) {
    const serverInstance = http.createServer(app);
    try {
      await tryListenOnce(serverInstance, port, host);
      return { server: serverInstance, port };
    } catch (err) {
      if (err?.code === 'EADDRINUSE' || /EADDRINUSE/i.test(String(err?.message || ''))) {
        console.warn(`[server] Port ${port} already in use. Trying ${port + 1}...`);
        try { serverInstance.close(); } catch (_) { /* ignore */ }
        port = port + 1;
        continue;
      }
      try { serverInstance.close(); } catch (_) { /* ignore */ }
      throw err;
    }
  }
  throw new Error(`Could not find an available port starting from ${basePort}`);
})();

server = result.server;
selectedPort = result.port;
process.env.PORT = String(selectedPort);

console.log(`[server] Server successfully started on port ${selectedPort} (host: ${host}). Startup time: ${Date.now() - startedAt}ms`);

server.on('error', (err) => {
  console.error('[server] Unhandled server error after startup:', err);
});

function setupGracefulShutdown(serverInstance) {
  if (!serverInstance) return;
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[server] Received ${signal}. Closing HTTP server...`);

    try {
      await new Promise((resolve) => {
        serverInstance.close(() => resolve());
      });

      setTimeout(() => {
        console.log('[server] Shutdown timeout reached; exiting.');
        process.exit(0);
      }, 2000);
    } catch (err) {
      console.error('[server] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

setupGracefulShutdown(server);

