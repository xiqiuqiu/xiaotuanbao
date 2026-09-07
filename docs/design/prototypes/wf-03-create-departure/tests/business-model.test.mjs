import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessFacts } from '../src/business-model.mjs';
test('business and assistant facts exclude proposals and include manual writes', () => {
  const groups = [{ amount:7200, written:true }, { amount:3200, written:true }, { amount:2400, written:false }];
  const source = { adults:8, children:2, adultPrice:6800, childPrice:4200, adjustment:0, discount:2000 };
  const facts = businessFacts(source, groups, [{ amount:600 }]);
  assert.equal(facts.costs, 11000);
  assert.equal(facts.resources.length, 3);
  assert.equal(facts.guestCount, 10);
  assert.equal(facts.receivable, 60800);
  assert.equal(businessFacts(null, [{amount:2400}], []).costs, 0);
});
