import assert from 'node:assert/strict';
import { hashComflyCatalog, sameSkipped } from './comfly-pricing-state.mjs';

const records = [
  { model_name: 'b', quota_type: 1, model_price: 0.04, other_info: { ratios: [1, 2] } },
  { model_name: 'a', quota_type: 0, model_price: 0 },
];
const first = hashComflyCatalog(records, { default: 1, premium: 2 });
assert.equal(first, hashComflyCatalog([
  { model_price: 0, quota_type: 0, model_name: 'a' },
  { other_info: { ratios: [1, 2] }, model_price: 0.04, quota_type: 1, model_name: 'b' },
], { premium: 2, default: 1 }));
assert.notEqual(first, hashComflyCatalog([{ ...records[0], model_price: 0.05 }, records[1]], { default: 1, premium: 2 }));
assert.equal(sameSkipped([{ model: 'a', reason: 'x' }, { model: 'b', reason: 'y' }],
  [{ reason: 'y', model: 'b' }, { reason: 'x', model: 'a' }]), true);
assert.equal(sameSkipped([{ model: 'a', reason: 'x' }], [{ model: 'a', reason: 'changed' }]), false);
console.log('Comfly pricing state tests passed.');
