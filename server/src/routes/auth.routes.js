import { Router } from 'express';
import { z } from 'zod';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: auth.schemas.register }), auth.register);
router.post('/login', authLimiter, validate({ body: auth.schemas.login }), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);

router.get('/me', requireAuth, auth.me);
router.patch('/me', requireAuth, validate({ body: auth.schemas.updateProfile }), auth.updateProfile);
router.post('/change-password', requireAuth, authLimiter, validate({ body: auth.schemas.changePassword }), auth.changePassword);

export default router;
