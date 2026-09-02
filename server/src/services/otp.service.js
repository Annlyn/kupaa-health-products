import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';
import { getSettings } from './settings.service.js';
import { mailerEnabled, sendMail } from './mailer.service.js';
import { normalisePhone, sendText, whatsappEnabled } from './whatsapp.service.js';

/**
 * One-time codes for sign-in.
 *
 * The identifier is verified before the password is asked for, which means a
 * challenge has to be created for identifiers that do not belong to an account
 * too — otherwise the first step would answer "is this email registered?" for
 * anyone who asked. Those challenges carry no `userId` and simply never verify.
 *
 * Codes are stored as an HMAC, never in the clear, and a challenge dies after
 * `LOGIN_OTP_MAX_ATTEMPTS` guesses or `LOGIN_OTP_TTL_MINUTES`, whichever comes
 * first.
 */

const CODE_LENGTH = 6;

const hashCode = (code) => crypto.createHmac('sha256', env.jwt.accessSecret).update(String(code)).digest('hex');

const newCode = () => String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

export const looksLikeEmail = (value) => String(value).includes('@');

/** Accepts "+91 98765 43210", "098765 43210" or "9876543210". */
export const phoneKey = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
};

/** Finds the account a typed identifier refers to, or null. */
export async function findUserByIdentifier(identifier) {
  const value = String(identifier ?? '').trim();
  if (!value) return null;

  if (looksLikeEmail(value)) return prisma.user.findUnique({ where: { email: value.toLowerCase() } });

  const phone = phoneKey(value);
  return phone ? prisma.user.findUnique({ where: { phone } }) : null;
}

/** "ku•••@gmail.com" / "+91 •••••5855" — enough to recognise, not to read off. */
export function maskDestination(channel, value) {
  const text = String(value ?? '');
  if (channel === 'EMAIL') {
    const [name, domain] = text.split('@');
    if (!domain) return text;
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
  }
  // Masked from the dialling form, so a stored 10-digit number still reads as
  // "+91 ••••••5678" rather than "+98 ••••5678".
  const digits = normalisePhone(text) || text.replace(/\D/g, '');
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : '';
  return `+${cc} ${'•'.repeat(Math.max(2, digits.length - cc.length - 4))}${digits.slice(-4)}`.trim();
}

/**
 * Picks how to reach this identifier.
 *
 * A phone number goes to WhatsApp. An email address goes to email — unless
 * SMTP is not set up and the account has a phone WhatsApp can reach, in which
 * case the code goes there rather than nowhere.
 */
function resolveChannel(identifier, user) {
  if (looksLikeEmail(identifier)) {
    if (mailerEnabled() || !(whatsappEnabled() && user?.phone)) {
      return { channel: 'EMAIL', destination: identifier };
    }
    return { channel: 'WHATSAPP', destination: user.phone };
  }

  const phone = user?.phone ?? phoneKey(identifier);
  return { channel: 'WHATSAPP', destination: phone };
}

async function deliver({ channel, destination, code, storeName }) {
  const minutes = env.auth.otpTtlMinutes;

  if (channel === 'EMAIL') {
    return sendMail({
      to: destination,
      subject: `${code} is your ${storeName} sign-in code`,
      text: `Your ${storeName} sign-in code is ${code}. It expires in ${minutes} minutes. If you did not try to sign in, ignore this email.`,
      html: `<p>Your <strong>${storeName}</strong> sign-in code is</p><p style="font-size:28px;letter-spacing:6px;margin:12px 0"><strong>${code}</strong></p><p>It expires in ${minutes} minutes. If you did not try to sign in, ignore this email.</p>`,
    });
  }

  return sendText(
    destination,
    `${code} is your ${storeName} sign-in code. It expires in ${minutes} minutes. Do not share it with anyone.`,
  );
}

/**
 * Starts a login challenge and sends the code.
 *
 * The return value is deliberately the same shape whether or not the identifier
 * belongs to an account. `code` comes back only outside production, so local
 * development does not need the server log open.
 */
export async function startLoginChallenge(identifier) {
  const value = String(identifier).trim();
  const user = await findUserByIdentifier(value);
  const settings = await getSettings();

  const key = looksLikeEmail(value) ? value.toLowerCase() : phoneKey(value) ?? value;
  const { channel, destination } = resolveChannel(value, user);
  const code = newCode();

  // One live challenge per identifier: a second "send code" replaces the first
  // rather than leaving several valid codes in the air.
  await prisma.otpChallenge.updateMany({
    where: { identifier: key, purpose: 'LOGIN', consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const challenge = await prisma.otpChallenge.create({
    data: {
      identifier: key,
      channel,
      destination: destination ? maskDestination(channel, destination) : null,
      codeHash: hashCode(code),
      userId: user?.id ?? null,
      expiresAt: new Date(Date.now() + env.auth.otpTtlMinutes * 60_000),
    },
  });

  if (user && destination) {
    try {
      await deliver({ channel, destination, code, storeName: settings.storeName });
    } catch (err) {
      // A delivery failure must not leak that the account exists, so the
      // response is unchanged — but the admin needs to see it.
      logger.error('[otp] delivery failed', channel, err.message);
    }
  } else {
    // No account, or an account with no reachable contact. Nothing is sent; the
    // code simply never arrives and verification fails.
    logger.info(`[otp] no deliverable contact for "${value}" — challenge created without sending`);
  }

  return {
    challengeId: challenge.id,
    channel,
    destination: challenge.destination,
    expiresInSeconds: env.auth.otpTtlMinutes * 60,
    // Never in production, and never when a real channel could have sent it.
    ...(!env.isProd && user ? { devCode: code } : {}),
  };
}

/** Same identifier, fresh code. */
export async function resendLoginChallenge(challengeId) {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw ApiError.badRequest('Start again — that code request has expired');
  return startLoginChallenge(challenge.identifier);
}

/**
 * Checks a code. Returns the verified user id, or throws with a message the
 * form can show.
 */
export async function verifyLoginChallenge({ challengeId, code }) {
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.consumedAt) throw ApiError.badRequest('That code has already been used. Request a new one.');
  if (challenge.expiresAt < new Date()) throw ApiError.badRequest('That code has expired. Request a new one.');
  if (challenge.attempts >= env.auth.otpMaxAttempts) {
    throw ApiError.badRequest('Too many incorrect codes. Request a new one.');
  }

  const attempts = challenge.attempts + 1;
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts } });

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const given = Buffer.from(hashCode(code), 'hex');
  const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);

  if (!matches || !challenge.userId) {
    const left = env.auth.otpMaxAttempts - attempts;
    throw ApiError.badRequest(left > 0 ? `That code is not right. ${left} attempt(s) left.` : 'That code is not right. Request a new one.');
  }

  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return { userId: challenge.userId, identifier: challenge.identifier };
}

/** Housekeeping: drop challenges nobody can use any more. */
export const purgeExpiredChallenges = () =>
  prisma.otpChallenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
