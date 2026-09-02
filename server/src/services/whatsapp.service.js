import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Thin WhatsApp Cloud API client (Meta Graph).
 *
 * Two things about WhatsApp shape this module:
 *
 * 1. Business-initiated messages must use a template Meta has approved. Free
 *    text only works inside the 24-hour window a customer's own message opens.
 *    So each send takes a template name and the parameters for it, and falls
 *    back to plain text when no template is configured — which is what makes
 *    local work and test numbers usable.
 * 2. A document has to be uploaded to Meta first (or served from a public URL).
 *    We upload the invoice bytes and send the returned media id, so invoices
 *    never need a public link.
 *
 * With no credentials the module runs in MOCK mode: every send is logged and
 * reports success, so checkout and the admin console work end to end locally.
 */

const graph = (path_) => `https://graph.facebook.com/${env.whatsapp.apiVersion}/${path_}`;

export const whatsappEnabled = () => env.whatsapp.enabled;
export const isMock = () => !env.whatsapp.enabled;

/**
 * To E.164 without the leading `+`, which is the form Cloud API wants.
 * Returns null for anything that cannot be a phone number, so callers can skip
 * the send instead of getting a 400 from Meta.
 */
export function normalisePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  digits = digits.replace(/^0+/, ''); // domestic trunk prefix
  const cc = env.whatsapp.defaultCountryCode;
  if (digits.length === 10 && cc) digits = `${cc}${digits}`;

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** The store owner's number — where new-order alerts go. */
export const ownerNumber = () => normalisePhone(env.whatsapp.ownerNumber);

async function call(path_, { method = 'POST', body, form } = {}) {
  const res = await fetch(graph(path_), {
    method,
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      ...(form ? {} : { 'Content-Type': 'application/json' }),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('[whatsapp]', method, path_, res.status, data);
    // Graph reports problems as { error: { message, code, error_data } }.
    const message = data?.error?.error_user_msg || data?.error?.message || 'WhatsApp request failed';
    throw ApiError.upstream(`WhatsApp: ${message}`, data);
  }
  return data;
}

const messages = (payload) => call(`${env.whatsapp.phoneNumberId}/messages`, { body: { messaging_product: 'whatsapp', ...payload } });

const sentId = (data) => data?.messages?.[0]?.id ?? null;

/** Plain text. Only delivers inside an open 24-hour customer window. */
export async function sendText(to, body) {
  const number = normalisePhone(to);
  if (!number) throw ApiError.badRequest('That is not a WhatsApp number we can send to');
  if (isMock()) return mockSend('text', number, body);

  const data = await messages({ to: number, type: 'text', text: { body: String(body).slice(0, 4096), preview_url: false } });
  return { messageId: sentId(data), to: number };
}

/**
 * An approved template. `params` fills the body placeholders in order;
 * `documentId`/`documentLink` fills a document header when the template has one.
 */
export async function sendTemplate(to, name, params = [], { documentId, documentLink, filename } = {}) {
  const number = normalisePhone(to);
  if (!number) throw ApiError.badRequest('That is not a WhatsApp number we can send to');
  if (isMock()) return mockSend(`template:${name}`, number, params.join(' | '));

  const components = [];
  if (documentId || documentLink) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: { ...(documentId ? { id: documentId } : { link: documentLink }), filename },
        },
      ],
    });
  }
  if (params.length) {
    components.push({ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text).slice(0, 1024) })) });
  }

  const data = await messages({
    to: number,
    type: 'template',
    template: {
      name,
      language: { code: env.whatsapp.templateLanguage },
      ...(components.length ? { components } : {}),
    },
  });
  return { messageId: sentId(data), to: number };
}

/** A PDF (or any document) already uploaded with `uploadMedia`. */
export async function sendDocument(to, { mediaId, link, filename, caption }) {
  const number = normalisePhone(to);
  if (!number) throw ApiError.badRequest('That is not a WhatsApp number we can send to');
  if (isMock()) return mockSend('document', number, filename);

  const data = await messages({
    to: number,
    type: 'document',
    document: {
      ...(mediaId ? { id: mediaId } : { link }),
      filename,
      ...(caption ? { caption: String(caption).slice(0, 1024) } : {}),
    },
  });
  return { messageId: sentId(data), to: number };
}

/** Uploads bytes to Meta and returns the media id, valid for 30 days. */
export async function uploadMedia(buffer, { filename, mimeType = 'application/pdf' }) {
  if (isMock()) return { mediaId: `mock-media-${Date.now()}` };

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const data = await call(`${env.whatsapp.phoneNumberId}/media`, { form });
  if (!data?.id) throw ApiError.upstream('WhatsApp did not return a media id', data);
  return { mediaId: data.id };
}

// ------------------------------------------------------------------ mock mode

function mockSend(kind, to, detail) {
  logger.info(`[whatsapp mock] ${kind} → +${to}${detail ? `: ${String(detail).slice(0, 160)}` : ''}`);
  return { messageId: `mock-${kind}-${Date.now()}`, to, mock: true };
}
