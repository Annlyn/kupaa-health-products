import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { checkServiceability, isMock, trackByAwb } from '../services/amazon.service.js';
import { logEvent, mapCarrierStatus } from '../services/order.service.js';
import { getSettings } from '../services/settings.service.js';

export const schemas = {
  serviceability: z.object({
    pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
    weight: z.coerce.number().min(0.05).max(50).default(0.5),
    cod: z.enum(['true', 'false']).default('false'),
    value: z.coerce.number().min(0).default(0),
  }),
};

/** GET /api/shipping/serviceability — used by the PDP "check delivery" widget. */
export const serviceability = asyncHandler(async (req, res) => {
  const { pincode, weight, cod, value } = req.query;
  const settings = await getSettings();
  const result = await checkServiceability({
    deliveryPincode: pincode,
    weightKg: weight,
    cod: cod === 'true',
    declaredValue: value,
  });

  res.json({
    ok: true,
    data: {
      ...result,
      pincode,
      fastest: result.services.slice().sort((a, b) => (a.estimatedDays ?? 99) - (b.estimatedDays ?? 99))[0] ?? null,
      cheapest: result.services[0] ?? null,
      freeShippingAbove: settings.freeShippingAbove,
      flatShippingFee: settings.flatShippingFee,
      mockMode: isMock(),
    },
  });
});

/** GET /api/shipping/track/:awb — public tracking, no login needed. */
export const track = asyncHandler(async (req, res) => {
  const awb = String(req.params.awb).trim();
  if (!awb) throw ApiError.badRequest('Enter a tracking number');
  res.json({ ok: true, data: await trackByAwb(awb) });
});

/**
 * POST /api/shipping/webhook — carrier status pushes.
 *
 * SP-API does not call arbitrary URLs: Amazon delivers shipment notifications
 * to EventBridge or SQS, so this endpoint is the landing place for whatever
 * relays them on. It authenticates with a shared `x-api-key` secret; when no
 * token is set we accept only in non-production.
 */
export const webhook = asyncHandler(async (req, res) => {
  const token = req.headers['x-api-key'];
  if (env.amazon.webhookToken) {
    if (token !== env.amazon.webhookToken) throw ApiError.unauthorized('Invalid webhook token');
  } else if (env.isProd) {
    throw ApiError.unauthorized('Webhook token not configured');
  }

  const payload = req.body || {};
  res.json({ ok: true }); // acknowledge fast; the relay retries on non-2xx

  try {
    // Amazon's notification payloads speak trackingId/eventCode; the older
    // broker-style keys are still accepted so an existing relay keeps working.
    const awb = payload.trackingId || payload.awb || payload.awb_code;
    const currentStatus = payload.eventCode || payload.summaryStatus || payload.current_status || payload.status;
    const orderNumber = payload.packageClientReferenceId || payload.order_id || payload.channel_order_id;

    const shipment = awb
      ? await prisma.shipment.findFirst({ where: { awbCode: String(awb) } })
      : orderNumber
        ? await prisma.shipment.findFirst({ where: { order: { orderNumber: String(orderNumber) } } })
        : null;

    if (shipment) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: String(currentStatus || shipment.status),
          etd: payload.promisedDeliveryDate || payload.etd || shipment.etd,
          trackingUrl: payload.trackUrl || payload.track_url || shipment.trackingUrl,
          courierName: payload.carrierName || payload.courier_name || shipment.courierName,
        },
      });

      const mapped = mapCarrierStatus(currentStatus);
      if (mapped) {
        const order = await prisma.order.findUnique({ where: { id: shipment.orderId } });
        if (order && order.status !== mapped && !['CANCELLED', 'RETURNED'].includes(order.status)) {
          await prisma.order.update({ where: { id: order.id }, data: { status: mapped } });
        }
      }
      await logEvent(shipment.orderId, mapped || 'UPDATE', `Carrier update: ${currentStatus}`, 'AMAZON');
    }

    await prisma.webhookLog.create({
      data: { source: 'AMAZON', event: String(currentStatus || 'update'), payload: JSON.stringify(payload).slice(0, 4000), ok: true },
    });
  } catch (err) {
    logger.error('[amazon shipping webhook]', err);
    await prisma.webhookLog.create({
      data: {
        source: 'AMAZON',
        event: 'error',
        payload: JSON.stringify(req.body || {}).slice(0, 4000),
        ok: false,
        error: String(err.message).slice(0, 500),
      },
    });
  }
});
