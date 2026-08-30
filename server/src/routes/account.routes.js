import { Router } from 'express';
import * as address from '../controllers/address.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

router.get('/', address.list);
router.post('/', validate({ body: address.addressSchema }), address.create);
router.put('/:id', validate({ body: address.addressSchema }), address.update);
router.delete('/:id', address.remove);

export default router;
