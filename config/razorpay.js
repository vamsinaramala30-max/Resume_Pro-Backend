import Razorpay from "razorpay";

// Razorpay is optional - payment features will be disabled if not configured.
export function isRazorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayClient() {
  if (!isRazorpayConfigured()) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Webhook secret is optional during development.
// Add `RAZORPAY_WEBHOOK_SECRET=` later from Razorpay Dashboard.
export function getRazorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET || "";
}


