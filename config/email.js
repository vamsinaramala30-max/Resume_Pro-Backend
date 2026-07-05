import { Resend } from "resend";

// Email provider using Resend (recommended) or Brevo
export function isEmailConfigured() {
  // Check for Resend API key (preferred)
  if (process.env.RESEND_API_KEY) return true;
  // Check for Brevo API key (alternative)
  if (process.env.BREVO_API_KEY) return true;
  return false;
}

export function getEmailClient() {
  if (process.env.RESEND_API_KEY) {
    return new Resend(process.env.RESEND_API_KEY);
  }
  // Could add Brevo support here if needed
  return null;
}

// Get the default sender email
export function getSenderEmail() {
  // Use Resend's default sender or custom
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}