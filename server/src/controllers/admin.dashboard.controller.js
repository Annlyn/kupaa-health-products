import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { round2 } from '../utils/money.js';
import { razorpayEnabled } from '../services/razorpay.service.js';
import { shiprocketEnabled } from '../services/shiprocket.service.js';

const PAID_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** GET /api/admin/stats — headline numbers + 14-day revenue series. */
export const stats = asyncHandler(async (_req, res) => {
  const now = new Date();
  const from = dayStart(new Date(now.getTime() - 13 * 86400_000));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [revenueAll, revenueMonth, orderCount, pending, customers, products, lowStock, recent, series, topRows] =
    await Promise.all([
      prisma.order.aggregate({ where: { status: { in: PAID_STATUSES } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { status: { in: PAID_STATUSES }, placedAt: { gte: monthStart } }, _sum: { total: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] } } }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.findMany({
        where: { isActive: true, stock: { lte: 5 } },
        orderBy: { stock: 'asc' },
        take: 8,
        select: { id: true, name: true, slug: true, stock: true, lowStockAt: true, sku: true },
      }),
      prisma.order.findMany({
        orderBy: { placedAt: 'desc' },
        take: 8,
        select: {
          id: true, orderNumber: true, total: true, status: true, paymentStatus: true, placedAt: true,
          shipName: true, user: { select: { name: true, email: true } },
        },
      }),
      prisma.order.findMany({
        where: { placedAt: { gte: from }, status: { in: PAID_STATUSES } },
        select: { total: true, placedAt: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: { order: { status: { in: PAID_STATUSES } } },
        _sum: { quantity: true, price: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 6,
      }),
    ]);

  // Bucket the last 14 days, including days with no orders.
  const buckets = new Map();
  for (let i = 13; i >= 0; i--) {
    const d = dayStart(new Date(now.getTime() - i * 86400_000));
    buckets.set(d.toISOString().slice(0, 10), { date: d.toISOString().slice(0, 10), revenue: 0, orders: 0 });
  }
  for (const o of series) {
    const key = dayStart(new Date(o.placedAt)).toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.revenue = round2(b.revenue + o.total);
      b.orders += 1;
    }
  }

  const statusCounts = await prisma.order.groupBy({ by: ['status'], _count: { status: true } });

  res.json({
    ok: true,
    data: {
      revenueTotal: round2(revenueAll._sum.total ?? 0),
      revenueMonth: round2(revenueMonth._sum.total ?? 0),
      orderCount,
      pendingCount: pending,
      customerCount: customers,
      productCount: products,
      avgOrderValue: orderCount ? round2((revenueAll._sum.total ?? 0) / orderCount) : 0,
      lowStock,
      recentOrders: recent,
      salesSeries: [...buckets.values()],
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count.status])),
      topProducts: topRows.map((r) => ({ productId: r.productId, name: r.name, unitsSold: r._sum.quantity ?? 0 })),
      integrations: { razorpay: razorpayEnabled(), shiprocket: shiprocketEnabled() },
    },
  });
});
