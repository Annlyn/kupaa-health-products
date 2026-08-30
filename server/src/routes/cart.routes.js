import { Router } from 'express';
import * as cart from '../controllers/cart.controller.js';
import * as wishlist from '../controllers/wishlist.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const cartRouter = Router();

// Guest pricing is public — everything else needs a session.
cartRouter.post('/quote', validate({ body: cart.schemas.guestQuote }), cart.guestQuote);

cartRouter.use(requireAuth);
cartRouter.get('/', cart.get);
cartRouter.post('/', validate({ body: cart.schemas.add }), cart.add);
cartRouter.post('/merge', validate({ body: cart.schemas.merge }), cart.merge);
cartRouter.patch('/:id', validate({ body: cart.schemas.update }), cart.update);
cartRouter.delete('/:id', cart.remove);
cartRouter.delete('/', cart.clear);

export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);
wishlistRouter.get('/', wishlist.list);
wishlistRouter.post('/:productId', wishlist.toggle);
