import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  // Prisma known errors -> friendly messages
  if (err.code === 'P2002') {
    status = 409;
    message = `${(err.meta?.target || ['value']).join(', ')} is already in use`;
  } else if (err.code === 'P2025') {
    status = 404;
    message = 'Record not found';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Uploaded file is too large';
  }

  if (status >= 500) {
    logger.error(err);
    if (process.env.NODE_ENV === 'production') {
      message = 'Something went wrong';
      details = undefined;
    }
  }

  res.status(status).json({ ok: false, error: { message, details } });
}
