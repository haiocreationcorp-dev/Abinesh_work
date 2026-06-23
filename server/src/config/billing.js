module.exports = {
  PRICE_PER_SYSTEM_PER_MONTH: 1, // INR — TEMP: reduced from 500 for Razorpay test-mode payment testing
  QUARTERLY_MONTHS: 3,   // quarterly plan = 3 months at the monthly rate
  YEARLY_MULTIPLIER: 10, // discounted yearly price = 10x monthly rate (~17% off vs 12x)
};
