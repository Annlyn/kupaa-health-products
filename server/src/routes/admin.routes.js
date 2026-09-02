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
import { ApiError } from '../utils/apiError.js';
import { isMock, shipFromAddress } from '../services/amazon.service.js';
import { isMock as whatsappMock, ownerNumber, whatsappEnabled } from '../services/whatsapp.service.js';
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
    // Reaching here with nothing attached means the request was malformed —
    // answering 201 with an empty list would look like a silent success and the
    // admin would just see "nothing happened".
    if (!req.files?.length) {
      throw ApiError.badRequest('No image was received. Choose a JPG, PNG, WEBP, AVIF or GIF file and try again.');
    }

    const files = req.files.map((f) => ({
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
router.get('/orders/:id/rates', adminOrders.rates);
router.post('/orders/:id/ship', validate({ body: adminOrders.schemas.ship }), adminOrders.ship);
router.get('/orders/:id/documents', adminOrders.documents);
router.get('/orders/:id/label', adminOrders.downloadLabel);
router.patch('/orders/:id/shipment', validate({ body: adminOrders.schemas.shipment }), adminOrders.updateShipment);
router.get('/orders/:id/invoice', adminOrders.invoice);
router.post('/orders/:id/invoice/whatsapp', adminOrders.whatsappInvoice);
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
    res.json({
      ok: true,
      data: {
        razorpay: { enabled: Boolean(env.razorpay.keyId), keyId: env.razorpay.keyId ? `${env.razorpay.keyId.slice(0, 8)}…` : null, webhookConfigured: Boolean(env.razorpay.webhookSecret) },
        shipping: {
          provider: 'Amazon Shipping',
          enabled: !isMock(),
          mockMode: isMock(),
          endpoint: env.amazon.endpoint,
          carrierId: env.amazon.carrierId,
          webhookConfigured: Boolean(env.amazon.webhookToken),
          shipFrom: shipFromAddress(),
        },
        whatsapp: {
          enabled: whatsappEnabled(),
          mockMode: whatsappMock(),
          apiVersion: env.whatsapp.apiVersion,
          phoneNumberId: env.whatsapp.phoneNumberId ? `…${env.whatsapp.phoneNumberId.slice(-4)}` : null,
          // Masked: the owner knows their own number, and this page is one
          // screenshot away from a support thread.
          ownerNumber: ownerNumber() ? `+${ownerNumber().slice(0, 2)}•••••${ownerNumber().slice(-3)}` : null,
          templates: env.whatsapp.templates,
          templateLanguage: env.whatsapp.templateLanguage,
        },
        store: await getSettings(),
      },
    });
  }),
);

export default router;
