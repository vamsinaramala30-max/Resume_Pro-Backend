import dotenv from 'dotenv';

// Load .env file FIRST, before any other imports can access process.env
const result = dotenv.config({ path: '.env' });

if (result.error) {
  console.warn('[env] No .env file found. Copy .env.example to .env to configure.');
}

// Helper to safely get env with defaults
export function getEnv(key, defaultValue) {
  return process.env[key] || defaultValue;
}

// Check if env exists
export function hasEnv(key) {
  return !!process.env[key];
}

function validateRequired() {
  const missing = [];
  if (!hasEnv('JWT_SECRET')) missing.push('JWT_SECRET');
  if (!hasEnv('JWT_REFRESH_SECRET')) missing.push('JWT_REFRESH_SECRET');
  return missing;
}

function getConfiguredServices() {
  const services = {
    jwt: { configured: false, name: 'JWT' },
    supabase: { configured: false, name: 'Supabase', keys: [] },
    email: { configured: false, name: 'Email', providers: [] },
    razorpay: { configured: false, name: 'Razorpay', keys: [] },
    ai: { configured: false, name: 'AI (OpenAI)' },
  };
  const jwtMissing = validateRequired();
  services.jwt.configured = jwtMissing.length === 0;
  if (hasEnv('SUPABASE_URL') && hasEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    services.supabase.configured = true;
  } else {
    if (!hasEnv('SUPABASE_URL')) services.supabase.keys.push('SUPABASE_URL');
    if (!hasEnv('SUPABASE_SERVICE_ROLE_KEY')) services.supabase.keys.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  const emailProviders = [];
  if (hasEnv('RESEND_API_KEY')) emailProviders.push('Resend');
  if (hasEnv('BREVO_API_KEY')) emailProviders.push('Brevo');
  if (hasEnv('SMTP_HOST') && hasEnv('SMTP_PORT') && hasEnv('SMTP_USER') && hasEnv('SMTP_PASS') && hasEnv('SMTP_FROM')) {
    emailProviders.push('SMTP');
  }
  services.email.configured = emailProviders.length > 0;
  services.email.providers = emailProviders;
  if (hasEnv('RAZORPAY_KEY_ID') && hasEnv('RAZORPAY_KEY_SECRET')) {
    services.razorpay.configured = true;
  } else {
    if (!hasEnv('RAZORPAY_KEY_ID')) services.razorpay.keys.push('RAZORPAY_KEY_ID');
    if (!hasEnv('RAZORPAY_KEY_SECRET')) services.razorpay.keys.push('RAZORPAY_KEY_SECRET');
  }
  if (hasEnv('OPENAI_API_KEY')) services.ai.configured = true;
  return services;
}

export function printConfigStatus() {
  const missingRequired = validateRequired();
  const services = getConfiguredServices();
  console.log('Server Configuration Status');
  if (missingRequired.length > 0) {
    console.log('Missing: ' + missingRequired.join(', '));
  } else {
    console.log('JWT configured');
  }
  if (services.supabase.configured) console.log('Supabase configured');
  else console.log('Supabase disabled');
  if (services.email.configured) console.log('Email configured (' + services.email.providers.join(', ') + ')');
  else console.log('Email disabled');
  if (services.razorpay.configured) console.log('Razorpay configured');
  else console.log('Razorpay disabled');
  if (services.ai.configured) console.log('AI configured');
  else console.log('AI disabled');
  return { missingRequired, services };
}

export { validateRequired, getConfiguredServices };