/**
 * Duco's test mode refuses a payment above GHS 10.00 (the payment provider's test environment declines more), so
 * with a test key an order above it can only fail - after the customer has entered their number. Say so here,
 * before the checkout session is created. A live key has no such limit.
 */
const TEST_KEY_PREFIX = 'duco_test_';
const DEFAULT_TEST_LIMIT_MINOR = 1000;

/** The most an order may be, in minor units, or null when there is no limit (a live key, or switched off with 0). */
export function orderLimitMinor(key, configured = process.env.DUCO_TEST_MAX_AMOUNT_MINOR) {
  if (!String(key || '').startsWith(TEST_KEY_PREFIX)) return null;
  if (configured === undefined || configured === '') return DEFAULT_TEST_LIMIT_MINOR;
  const n = Number(configured);
  if (n === 0) return null;
  // Anything that is not a positive whole number is a mistake, and the safe reading of a mistake is the default.
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TEST_LIMIT_MINOR;
}

const money = (minor, currency) => `${currency} ${(minor / 100).toFixed(2)}`;

export function limitMessage({ total, currency, limit }) {
  return `Test payments are limited to ${money(limit, currency)}; this order is ${money(total, currency)}. Remove an item or lower a quantity.`;
}
