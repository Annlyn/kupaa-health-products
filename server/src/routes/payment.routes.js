import { Router } from 'express';
import * as payments from '../controllers/payment.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/config', payments.config);
router.post('/verify', requireAuth, validate({ body: payments.schemas.verify }), payments.verify);
router.post('/retry/:orderId', requireAuth, payments.retry);
router.post('/failed', requireAuth, validate({ body: payments.schemas.failed }), payments.markFailed);

export default router;
