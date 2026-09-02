import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Transactional email over SMTP — currently just sign-in codes.
 *
 * With no SMTP credentials the module runs in MOCK mode and writes the message
 * to the log instead of sending it, the same as the payment, shipping and
 * WhatsApp clients, so the sign-in flow is complete on a laptop.
 */

let transport = null;

export const mailerEnabled = () => env.smtp.enabled;
export const isMock = () => !env.smtp.enabled;

function getTransport() {
  if (!env.smtp.enabled) throw ApiError.badRequest('Email is not configured');
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // 465 is implicit TLS; everything else upgrades with STARTTLS.
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  return transport;
}

export async function sendMail({ to, subject, text, html }) {
  if (isMock()) {
    logger.info(`[mail mock] ${to} — ${subject}: ${String(text || '').replace(/\s+/g, ' ').slice(0, 160)}`);
    return { messageId: `mock-mail-${Date.now()}`, to, mock: true };
  }

  const info = await getTransport().sendMail({ from: env.smtp.from, to, subject, text, html });
  return { messageId: info.messageId, to };
}
