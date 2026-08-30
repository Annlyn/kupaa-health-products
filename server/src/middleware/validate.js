import { ApiError } from '../utils/apiError.js';

/**
 * validate({ body, query, params }) — each value is a zod schema.
 * Parsed output replaces the raw input so handlers get coerced, trimmed data.
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['body', 'query', 'params']) {
    const schema = schemas[key];
    if (!schema) continue;
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(ApiError.badRequest(details[0]?.message || 'Invalid request', details));
    }
    if (key === 'query') {
      // req.query is a getter in Express 5-style setups; mutate in place to stay safe
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[key] = result.data;
    }
  }
  return next();
};
