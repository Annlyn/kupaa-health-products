import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getSettings } from '../services/settings.service.js';
import authRoutes from './auth.routes.js';
import { productRouter, categoryRouter, reviewRouter } from './catalog.routes.js';
import { cartRouter, wishlistRouter } from './cart.routes.js';
import addressRoutes from './account.routes.js';
import orderRoutes from './order.routes.js';
import paymentRoutes from './payment.routes.js';
import shippingRoutes from './shipping.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', (_req, res) =>
  res.json({ ok: true, data: { status: 'up', service: env.store.name, time: new Date().toISOString() } }),
);

/**
 * Everything the storefront needs to render its chrome and copy. All of it is
 * admin-editable under Admin → Store settings.
 */
router.get(
  '/store',
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await getSettings() });
  }),
);

router.use('/auth', authRoutes);
router.use('/products', productRouter);
router.use('/categories', categoryRouter);
router.use('/reviews', reviewRouter);
router.use('/cart', cartRouter);
router.use('/wishlist', wishlistRouter);
router.use('/addresses', addressRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/shipping', shippingRoutes);
router.use('/admin', adminRoutes);

export default router;
