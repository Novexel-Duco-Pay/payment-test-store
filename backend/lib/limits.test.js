import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { limitMessage, orderLimitMinor } from './limits.js';

describe('orderLimitMinor', () => {
  it('limits a test key to GHS 10.00 by default and never a live key', () => {
    assert.equal(orderLimitMinor('duco_test_abc', undefined), 1000);
    assert.equal(orderLimitMinor('duco_test_abc', ''), 1000);
    assert.equal(orderLimitMinor('duco_live_abc', undefined), null);
    assert.equal(orderLimitMinor('', undefined), null);
    assert.equal(orderLimitMinor(undefined, undefined), null);
  });

  it('can be changed or switched off for a test key', () => {
    assert.equal(orderLimitMinor('duco_test_abc', '2500'), 2500);
    assert.equal(orderLimitMinor('duco_test_abc', '0'), null);
  });

  it('reads a mistake as the default, not as no limit', () => {
    for (const bad of ['abc', '-5', '10.5', 'NaN']) assert.equal(orderLimitMinor('duco_test_abc', bad), 1000, bad);
  });
});

describe('limitMessage', () => {
  it('names the limit, the order and what to do', () => {
    assert.equal(
      limitMessage({ total: 1360, currency: 'GHS', limit: 1000 }),
      'Test payments are limited to GHS 10.00; this order is GHS 13.60. Remove an item or lower a quantity.',
    );
  });
});
