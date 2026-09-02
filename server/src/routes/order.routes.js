import { Router } from 'express';
import * as orders from '../controllers/order.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.use(requireAuth);

router.post('/', writeLimiter, validate({ body: orders.schemas.create }), orders.create);
router.get('/', validate({ query: orders.schemas.listMine }), orders.listMine);
router.get('/:id', orders.getOne);
router.get('/:id/track', orders.track);
router.get('/:id/invoice', orders.invoice);
router.post('/:id/cancel', orders.cancel);

export default router;
