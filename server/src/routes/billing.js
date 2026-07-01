const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const chiefAuth = require('../middleware/chiefAuth');
const prisma = require('../config/prisma');
const { addMonths } = require('../utils/dates');
const { PRICE_PER_SYSTEM_PER_MONTH, QUARTERLY_MONTHS, YEARLY_MULTIPLIER } = require('../config/billing');

let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

const PLAN_MONTHS = { QUARTERLY: 3, YEARLY: 12 };
const PLAN_MULTIPLIER = { QUARTERLY: QUARTERLY_MONTHS, YEARLY: YEARLY_MULTIPLIER };

// GET /api/billing/summary
router.get('/summary', chiefAuth, async (req, res) => {
  const institution = await prisma.institution.findUnique({ where: { id: req.user.institutionId } });
  if (!institution) return res.status(404).json({ error: 'Institution not found' });

  const now = new Date();
  const { systemCount, subscriptionStartedAt, subscriptionExpiresAt, suspended } = institution;
  const active = !suspended && !!subscriptionExpiresAt && subscriptionExpiresAt > now;
  const daysRemaining = subscriptionExpiresAt
    ? Math.max(0, Math.ceil((subscriptionExpiresAt.getTime() - now.getTime()) / 86400000))
    : 0;

  res.json({
    institutionName: institution.name,
    institutionCode: institution.code,
    systemCount,
    pricePerSystemPerMonth: PRICE_PER_SYSTEM_PER_MONTH,
    quarterlyTotal: systemCount * PRICE_PER_SYSTEM_PER_MONTH * QUARTERLY_MONTHS,
    yearlyTotal: systemCount * PRICE_PER_SYSTEM_PER_MONTH * YEARLY_MULTIPLIER,
    suspended,
    active,
    subscriptionStartedAt,
    subscriptionExpiresAt,
    nextPaymentDueDate: subscriptionExpiresAt,
    daysRemaining,
  });
});

// PATCH /api/billing/system-count
router.patch('/system-count', chiefAuth, async (req, res) => {
  const { systemCount } = req.body;
  if (!Number.isInteger(systemCount) || systemCount < 0) {
    return res.status(400).json({ error: 'systemCount must be a non-negative integer' });
  }
  const institution = await prisma.institution.update({
    where: { id: req.user.institutionId },
    data: { systemCount },
  });
  res.json(institution);
});

// POST /api/billing/order
router.post('/order', chiefAuth, async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: 'Payment gateway not configured on this server' });
  try {
    const { planType } = req.body;
    if (!['QUARTERLY', 'YEARLY'].includes(planType)) {
      return res.status(400).json({ error: 'planType must be QUARTERLY or YEARLY' });
    }

    const institution = await prisma.institution.findUnique({ where: { id: req.user.institutionId } });
    if (!institution) return res.status(404).json({ error: 'Institution not found' });
    if (!institution.systemCount || institution.systemCount <= 0) {
      return res.status(400).json({ error: 'Set your number of systems before paying' });
    }

    const amount = institution.systemCount * PRICE_PER_SYSTEM_PER_MONTH * PLAN_MULTIPLIER[planType] * 100; // paise

    const now = new Date();
    const periodStart = institution.subscriptionExpiresAt && institution.subscriptionExpiresAt > now
      ? institution.subscriptionExpiresAt
      : now;
    const periodEnd = addMonths(periodStart, PLAN_MONTHS[planType]);

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `inst_${institution.id.slice(-12)}_${Date.now()}`,
      notes: { institutionId: institution.id, planType },
    });

    await prisma.payment.create({
      data: {
        institutionId: institution.id,
        planType,
        systemCount: institution.systemCount,
        amount,
        razorpayOrderId: order.id,
        status: 'CREATED',
        periodStart,
        periodEnd,
      },
    });

    res.status(201).json({ orderId: order.id, amount, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('billing/order error:', err);
    res.status(500).json({ error: err.error?.description || err.message || 'Could not create order' });
  }
});

// POST /api/billing/verify
router.post('/verify', chiefAuth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are required' });
    }

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) return res.status(404).json({ error: 'Order not found' });
    if (payment.institutionId !== req.user.institutionId) {
      return res.status(403).json({ error: 'This order does not belong to your institution' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      await prisma.payment.update({ where: { razorpayOrderId }, data: { status: 'FAILED' } });
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    const institution = await prisma.institution.findUnique({ where: { id: payment.institutionId } });

    await prisma.$transaction([
      prisma.payment.update({
        where: { razorpayOrderId },
        data: { razorpayPaymentId, razorpaySignature, status: 'PAID', paidAt: new Date() },
      }),
      prisma.institution.update({
        where: { id: payment.institutionId },
        data: {
          subscriptionExpiresAt: payment.periodEnd,
          subscriptionStartedAt: institution.subscriptionStartedAt ?? payment.periodStart,
        },
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not verify payment' });
  }
});

// GET /api/billing/payments
router.get('/payments', chiefAuth, async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { institutionId: req.user.institutionId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(payments);
});

module.exports = router;
