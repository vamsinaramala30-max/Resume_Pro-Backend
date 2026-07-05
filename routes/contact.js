import express from 'express';
import { getEmailClient, getSenderEmail, isEmailConfigured } from '../config/email.js';
import asyncHandler from '../middleware/asyncHandler.js';

const router = express.Router();

// Contact form rate limiter: 5 requests per 15 minutes per IP
export const contactLimiter = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again later.' },
};

// Validation helper
function validateContactForm(data) {
  const errors = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }

  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Valid email is required');
  }

  if (!data.subject || data.subject.trim().length < 3) {
    errors.push('Subject is required');
  }

  if (!data.message || data.message.trim().length < 10) {
    errors.push('Message must be at least 10 characters');
  }

  // Sanitize inputs
  const sanitized = {
    name: data.name?.replace(/[<>]/g, '').trim() || '',
    email: data.email?.trim().toLowerCase() || '',
    phone: data.phone?.replace(/[<>]/g, '').trim() || '',
    subject: data.subject?.replace(/[<>]/g, '').trim() || '',
    message: data.message?.replace(/[<>]/g, '').trim() || '',
  };

  return { errors, sanitized };
}

// Send admin notification email
async function sendAdminNotification(name, email, phone, subject, message) {
  const emailClient = getEmailClient();
  const senderEmail = getSenderEmail();
  const adminEmail = process.env.ADMIN_EMAIL || 'vamsinaramala30@gmail.com';

  if (!emailClient) {
    console.log('Email not configured - would send admin notification:', { name, email, subject });
    return true;
  }

  try {
    await emailClient.emails.send({
      from: senderEmail,
      to: adminEmail,
      subject: `New Contact Form Message - ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
      text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
Subject: ${subject}

Message:
${message}
      `,
    });

    return true;
  } catch (error) {
    console.error('Failed to send admin notification:', error);
    return false;
  }
}

// Send user confirmation email
async function sendUserConfirmation(userEmail, userName, subject) {
  const emailClient = getEmailClient();
  const senderEmail = getSenderEmail();

  if (!emailClient) {
    console.log('Email not configured - would send confirmation to:', userEmail);
    return true;
  }

  try {
    await emailClient.emails.send({
      from: senderEmail,
      to: userEmail,
      subject: 'We received your message - Resume PRO',
      html: `
        <h2>Thank you for contacting us, ${userName}!</h2>
        <p>We've received your message with subject: <strong>${subject}</strong></p>
        <p>Our team will get back to you within 24 hours during business days.</p>
        <hr>
        <p>If you have any urgent questions, feel free to reply to this email or reach out on WhatsApp.</p>
        <p>Best regards,<br>The Resume PRO Team</p>
      `,
      text: `
Thank you for contacting us, ${userName}!

We've received your message with subject: ${subject}

Our team will get back to you within 24 hours during business days.

If you have any urgent questions, feel free to reply to this email or reach out on WhatsApp.

Best regards,
The Resume PRO Team
      `,
    });

    return true;
  } catch (error) {
    console.error('Failed to send confirmation:', error);
    return false;
  }
}

// POST /api/contact
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    // Validate input
    const { errors, sanitized } = validateContactForm({ name, email, phone, subject, message });

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        messages: errors,
      });
    }

    // Send admin notification
    const adminSent = await sendAdminNotification(
      sanitized.name,
      sanitized.email,
      sanitized.phone,
      sanitized.subject,
      sanitized.message
    );

    if (!adminSent) {
      return res.status(500).json({
        error: 'Failed to send message',
        message: 'Please try again later',
      });
    }

    // Send user confirmation (best effort - don't fail if this fails)
    await sendUserConfirmation(sanitized.email, sanitized.name, sanitized.subject);

    // Log the contact (for analytics)
    console.log(`Contact form: ${sanitized.name} (${sanitized.email}) - ${sanitized.subject}`);

    return res.status(200).json({
      status: 'success',
      message: 'Message sent successfully',
    });
  })
);

export default router;