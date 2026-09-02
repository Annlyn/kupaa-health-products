import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { attachUser } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/error.js';
import { uploadDir } from './middleware/upload.js';
import { webhook as razorpayWebhook } from './controllers/payment.controller.js';
import { webhook as shippingWebhook } from './controllers/shipping.controller.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Product images are served from this origin and embedded by the SPA.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  const allowedOrigins = new Set([...env.clientOrigins, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  app.use(
    cors({
      origin: (origin, cb) => {
        // No Origin header: curl, server-to-server, same-origin navigation.
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin.replace(/\/$/, ''))) return cb(null, true);
        return cb(new Error(`Origin ${origin} is not allowed. Add it to CLIENT_URL (comma-separated) and restart.`));
      },
      credentials: true,
    }),
  );

  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  // Webhooks are mounted before the JSON parser: Razorpay signs the raw bytes.
  app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), razorpayWebhook);
  app.post('/api/shipping/webhook', express.json({ limit: '1mb' }), shippingWebhook);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Uploaded filenames are content-unique, but seeded demo files keep stable
  // names — so cache for a day rather than marking them immutable.
  app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

  app.use('/api', apiLimiter, attachUser, routes);

  // In production the built SPA is served from the same origin.
  if (env.isProd) {
    const clientDist = path.resolve(process.cwd(), '../client/dist');
    app.use(express.static(clientDist, { maxAge: '1h' }));
    app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
