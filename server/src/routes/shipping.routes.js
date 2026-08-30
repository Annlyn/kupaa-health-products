import { Router } from 'express';
import * as shipping from '../controllers/shipping.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/serviceability', validate({ query: shipping.schemas.serviceability }), shipping.serviceability);
router.get('/track/:awb', shipping.track);

export default router;
