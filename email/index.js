import { Resend } from "resend";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Resend client
const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;

// Log email configuration status on startup
console.log("[email] ========== EMAIL SERVICE CONFIG ==========");
console.log("[email] RESEND_API_KEY configured:", !!resendKey);
if (!resendKey) {
  console.warn("[email] WARNING: No RESEND_API_KEY found in environment!");
  console.warn("[email] Emails will NOT be delivered. Set RESEND_API_KEY in your .env file.");
} else {
  // Log masked key for debugging
  const maskedKey = resendKey.substring(0, 8) + "..." + resendKey.substring(resendKey.length - 4);
  console.log("[email] RESEND_API_KEY:", maskedKey);
}
console.log("[email] EMAIL_FROM:", process.env.EMAIL_FROM || "onboarding@resend.dev");
console.log("[email] ===========================================");

function getSenderEmail() {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

async function renderTemplate(templateFile, vars) {
  const fullPath = path.join(__dirname, "templates", templateFile);
  let html = await fs.readFile(fullPath, "utf8");
  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(`{{${k}}}`, String(v));
  }
  return html;
}

// Generate cryptographically secure OTP
function generateSecureOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendVerifyEmailOtp({ toEmail, otp }) {
  console.log("[email] ===== SEND VERIFY EMAIL OTP =====");
  console.log("[email] To:", toEmail);
  console.log("[email] OTP:", otp);

  if (!resend) {
    const error = "[email] RESEND_API_KEY not configured. Email cannot be sent.";
    console.error(error);
    throw new Error("Email service not configured. Please contact support.");
  }

  const from = getSenderEmail();
  const html = await renderTemplate("verifyEmailOtp.html", { OTP: otp });

  try {
    const result = await resend.emails.send({
      from,
      to: toEmail,
      subject: "Verify your email ��� Resume PRO",
      html,
    });

    console.log("[email] Resend response:", JSON.stringify(result));

    if (result.error) {
      console.error("[email] Resend error:", result.error);
      throw new Error(result.error.message || "Failed to send email");
    }

    console.log("[email] SUCCESS: Verification email sent to", toEmail);
    return result;
  } catch (err) {
    console.error("[email] Failed to send verification email:", err.message);
    throw new Error(`Email delivery failed: ${err.message}`);
  }
}

export async function sendSubscriptionConfirmationEmail({ toEmail, name }) {
  console.log("[email] ===== SEND SUBSCRIPTION CONFIRMATION =====");
  console.log("[email] To:", toEmail);

  if (!resend) {
    console.error("[email] RESEND_API_KEY not configured. Email cannot be sent.");
    throw new Error("Email service not configured. Please contact support.");
  }

  const from = getSenderEmail();
  const html = await renderTemplate("subscriptionConfirm.html", { NAME: name || "Subscriber" });

  try {
    const result = await resend.emails.send({
      from,
      to: toEmail,
      subject: "You're subscribed to Resume PRO updates!",
      html,
    });

    console.log("[email] Resend response:", JSON.stringify(result));

    if (result.error) {
      console.error("[email] Resend error:", result.error);
      throw new Error(result.error.message || "Failed to send email");
    }

    console.log("[email] SUCCESS: Subscription confirmation sent to", toEmail);
    return result;
  } catch (err) {
    console.error("[email] Failed to send subscription confirmation:", err.message);
    throw new Error(`Email delivery failed: ${err.message}`);
  }
}

// For password reset emails
export async function sendForgotPasswordOtp({ toEmail, otp }) {
  console.log("[email] ===== SEND FORGOT PASSWORD OTP =====");
  console.log("[email] To:", toEmail);
  console.log("[email] OTP:", otp);

  if (!resend) {
    const error = "[email] RESEND_API_KEY not configured. Email cannot be sent.";
    console.error(error);
    throw new Error("Email service not configured. Please contact support.");
  }

  const from = getSenderEmail();
  const html = await renderTemplate("forgotPasswordOtp.html", { OTP: otp });

  try {
    const result = await resend.emails.send({
      from,
      to: toEmail,
      subject: "Reset your password — Resume PRO",
      html,
    });

    console.log("[email] Resend response:", JSON.stringify(result));

    if (result.error) {
      console.error("[email] Resend error:", result.error);
      throw new Error(result.error.message || "Failed to send email");
    }

    console.log("[email] SUCCESS: Password reset email sent to", toEmail);
    return result;
  } catch (err) {
    console.error("[email] Failed to send password reset email:", err.message);
    throw new Error(`Email delivery failed: ${err.message}`);
  }
}

// Export secure OTP generator for use elsewhere
export { generateSecureOTP };