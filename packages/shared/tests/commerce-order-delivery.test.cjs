const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeCommerceOrderDeliverySnapshot: normalize, normalizeOnlineSalesDeliverySettings: settings } = require('../dist');
const address = { recipientName: 'Recipient', addressLine1: '42 Road', district: 'Central', city: 'London', countryCode: 'gb' };
test('delivery snapshots normalize a bounded address independently of buyer and fulfillment', () => {
  assert.deepEqual(normalize({ method: 'pickup', address }), { method: 'pickup', address: null });
  assert.deepEqual(normalize({ method: 'shipping', address: { ...address, addressLine2: ' ', postalCode: ' SW1A ', note: 'Ring\nbell', carrier: 'ignored' }, shippingPrice: 9 }),
    { method: 'shipping', address: { ...address, countryCode: 'GB', postalCode: 'SW1A', note: 'Ring\nbell' } });
  for (const input of [undefined, null, [], { method: 'other' }, { method: 'shipping' }, { method: 'shipping', address: [] },
    ...[{ recipientName: '' }, { addressLine1: 'x'.repeat(301) }, { addressLine2: 9 }, { district: '' }, { city: 'x'.repeat(121) },
      { postalCode: 'x'.repeat(33) }, { countryCode: 'TUR' }, { countryCode: '12' }, { countryCode: 'ß' }, { note: 'x'.repeat(501) }, { recipientName: 'secret\u0000' }]
      .map(patch => ({ method: 'shipping', address: { ...address, ...patch } }))]) {
    assert.throws(() => normalize(input), { message: 'Sipariş teslimat bilgileri geçersiz.' });
  }
});
test('online-sales configuration requires at least one explicit boolean method', () => {
  for (const input of [null, {}, { pickupEnabled: 1, shippingEnabled: false }, { pickupEnabled: false, shippingEnabled: false }]) assert.throws(() => settings(input));
  assert.deepEqual(settings({ pickupEnabled: false, shippingEnabled: true, carrier: 'ignored' }), { pickupEnabled: false, shippingEnabled: true });
});
