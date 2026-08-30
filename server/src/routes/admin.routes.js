import { Router } from 'express';
import * as dashboard from '../controllers/admin.dashboard.controller.js';
import * as catalog from '../controllers/admin.catalog.controller.js';
import * as adminOrders from '../controllers/admin.orders.controller.js';
import * as people from '../controllers/admin.users.controller.js';
import * as settings from '../controllers/admin.settings.controller.js';
import * as reviews from '../controllers/review.controller.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadImages } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPickupLocations, isMock } from '../services/shiprocket.service.js';
import { env } from '../config/env.js';
import { getSettings } from '../services/settings.service.js';

const router = Router();
router.use(requireAdmin);

router.get('/stats', dashboard.stats);

// --------------------------------------------------------------- media upload
router.post(
  '/upload',
  uploadImages.array('images', 8),
  asyncHandler(async (req, res) => {
    const files = (req.files || []).map((f) => ({
      url: `/uploads/${f.filename}`,
      name: f.originalname,
      size: f.size,
    }));
    res.status(201).json({ ok: true, data: files });
  }),
);

// -------------------------------------------------------------------- catalog
router.get('/products', validate({ query: catalog.schemas.productList }), catalog.listProducts);
router.post('/products', validate({ body: catalog.schemas.product }), catalog.createProduct);
router.post('/products/bulk', validate({ body: catalog.schemas.bulk }), catalog.bulkUpdate);
router.get('/products/:id', catalog.getProduct);
router.post('/products/:id/duplicate', catalog.duplicateProduct);
router.put('/products/:id', validate({ body: catalog.schemas.product }), catalog.updateProduct);
router.patch('/products/:id/stock', catalog.adjustStock);
router.delete('/products/:id', catalog.deleteProduct);

router.get('/categories', catalog.listCategories);
router.post('/categories', validate({ body: catalog.schemas.category }), catalog.createCategory);
router.put('/categories/:id', validate({ body: catalog.schemas.category }), catalog.updateCategory);
router.delete('/categories/:id', catalog.deleteCategory);

// --------------------------------------------------------------------- orders
router.get('/orders/export.csv', adminOrders.exportCsv);
router.get('/orders', validate({ query: adminOrders.schemas.list }), adminOrders.list);
router.get('/orders/:id', adminOrders.getOne);
router.patch('/orders/:id/status', validate({ body: adminOrders.schemas.setStatus }), adminOrders.setStatus);
router.get('/orders/:id/couriers', adminOrders.couriers);
router.post('/orders/:id/ship', validate({ body: adminOrders.schemas.ship }), adminOrders.ship);
router.get('/orders/:id/documents', adminOrders.documents);
router.get('/orders/:id/track', adminOrders.trackOrder);
router.post('/orders/:id/cancel-shipment', adminOrders.cancelShipmentForOrder);
router.post('/orders/:id/refund', validate({ body: adminOrders.schemas.refund }), adminOrders.refund);

// ------------------------------------------------------------ people & promos
router.get('/users', validate({ query: people.schemas.list }), people.listUsers);
router.get('/users/:id', people.getUser);
router.patch('/users/:id', validate({ body: people.schemas.update }), people.updateUser);

router.get('/coupons', people.listCoupons);
router.post('/coupons', validate({ body: people.schemas.coupon }), people.createCoupon);
router.put('/coupons/:id', validate({ body: people.schemas.coupon }), people.updateCoupon);
router.delete('/coupons/:id', people.deleteCoupon);

router.get('/reviews', validate({ query: reviews.adminListSchema }), reviews.adminList);
router.delete('/reviews/:id', reviews.adminRemove);

// ------------------------------------------------------- storefront content
router.get('/settings', settings.get);
router.put('/settings', validate({ body: settings.schemas.update }), settings.update);
router.post('/settings/reset', validate({ body: settings.schemas.reset }), settings.reset);

// --------------------------------------------------------------- integrations
router.get(
  '/integrations',
  asyncHandler(async (_req, res) => {
    const pickupLocations = await getPickupLocations().catch(() => []);
    res.json({
      ok: true,
      data: {
        razorpay: { enabled: Boolean(env.razorpay.keyId), keyId: env.razorpay.keyId ? `${env.razorpay.keyId.slice(0, 8)}…` : null, webhookConfigured: Boolean(env.razorpay.webhookSecret) },
        shiprocket: {
          enabled: !isMock(),
          mockMode: isMock(),
          pickupLocation: env.shiprocket.pickupLocation,
          pickupPincode: env.shiprocket.pickupPincode,
          webhookConfigured: Boolean(env.shiprocket.webhookToken),
          pickupLocations,
        },
        store: await getSettings(),
      },
    });
  }),
);

export default router;
