import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { SETTINGS_GROUPS, SETTINGS_SCHEMA, getSettings, resetSettings, updateSettings } from '../services/settings.service.js';

export const schemas = {
  update: z.record(z.any()).refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
  reset: z.object({ keys: z.array(z.string()).optional() }),
};

/**
 * GET /api/admin/settings — current values plus the field metadata the admin
 * form renders from, so adding a setting server-side needs no UI change.
 */
export const get = asyncHandler(async (_req, res) => {
  const values = await getSettings();
  const overridden = new Set((await prisma.setting.findMany({ select: { key: true } })).map((r) => r.key));

  const fields = Object.entries(SETTINGS_SCHEMA).map(([key, spec]) => ({
    key,
    group: spec.group,
    type: spec.type,
    label: spec.label,
    hint: spec.hint ?? null,
    min: spec.min ?? null,
    max: spec.max ?? null,
    fields: spec.fields ?? null,
    isCustomised: overridden.has(key),
  }));

  res.json({ ok: true, data: { values, fields, groups: SETTINGS_GROUPS } });
});

export const update = asyncHandler(async (req, res) => {
  const unknown = Object.keys(req.body).filter((k) => !SETTINGS_SCHEMA[k]);
  if (unknown.length === Object.keys(req.body).length) throw ApiError.badRequest('No recognised settings were supplied');

  res.json({ ok: true, data: await updateSettings(req.body) });
});

/** POST /api/admin/settings/reset — drop overrides so .env defaults apply again. */
export const reset = asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await resetSettings(req.body.keys) });
});
