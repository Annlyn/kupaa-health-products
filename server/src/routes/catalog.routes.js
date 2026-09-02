import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import * as categories from '../controllers/category.controller.js';
import * as reviews from '../controllers/review.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const productRouter = Router();

// Static paths must be declared before the /:slug catch-all.
productRouter.get('/carousel', products.carousel);
productRouter.get('/facets', products.facets);
productRouter.get('/suggest', products.suggest);
productRouter.get('/', validate({ query: products.listQuerySchema }), products.list);
productRouter.get('/:slug', products.bySlug);
productRouter.get('/:slug/reviews', reviews.listForProduct);
productRouter.post('/:slug/reviews', requireAuth, validate({ body: reviews.reviewSchema }), reviews.upsert);

export const categoryRouter = Router();
categoryRouter.get('/', categories.list);
categoryRouter.get('/:slug', categories.bySlug);

export const reviewRouter = Router();
reviewRouter.delete('/:id', requireAuth, reviews.remove);
