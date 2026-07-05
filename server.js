export * from './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import logEvent from './shared/logging/logger.js';
import { sanitizeInput } from './middleware/validate.js';
import errorHandler from './middleware/errorHandler.js';

import connectDB from './config/db.js';
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

const configStatus = printConfigStatus();
if (process.env.MONGO_URI) {
  connectDB().catch(console.error);
}
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server successfully deployed running on port ' + PORT);
});
