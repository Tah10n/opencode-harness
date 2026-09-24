// Neutral public API fixture. These scripts are never installed in the bundle.
export const original = `exports.normalize = function (value) {
  if (typeof value !== 'string') throw new TypeError('text required');
  if (value.length > 32) throw new RangeError('text too long');
  return value.trim();
};
`;
export const changed = original.replace('value.trim()', 'value.trim().toLowerCase()');
export const gated = changed.replace('(value)', '(value, options = {})').replace('return value.trim().toLowerCase();', 'return options.fold ? value.trim().toLowerCase() : value.trim();');
export const oldAssertion = "assert.equal(normalize('  AbC  '), 'AbC');";
export const newAssertion = "assert.equal(normalize('  AbC  '), 'abc');";
export const mixed = `const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize} = require('./index.cjs');
test('mixed public normalization contract', () => {
  ${oldAssertion}
  assert.equal(normalize('   '), '');
  assert.equal(normalize('x'.repeat(32)), 'x'.repeat(32));
  assert.throws(() => normalize(null), TypeError);
  assert.throws(() => normalize('x'.repeat(33)), RangeError);
});
`;
export const regression = `const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize} = require('./index.cjs');
test('changed policy through the existing one-argument caller', () => {
  assert.equal(normalize('  MiXeD  '), 'mixed');
  assert.equal(normalize('UPPER'), 'upper');
});
`;
export const task = `Change normalize(text) to return trimmed lowercase text for every existing valid string input. This explicitly replaces case preservation. Preserve empty-string handling, the 32-character input limit and TypeError/RangeError validation. Keep the existing one-argument public API and user drafts. Update only the replaced expectation in the mixed test, retain its other assertions, and add a public regression. Run node --test after the final edit. Do not commit or publish.`;
export const preservedTask = `Repair normalize(text) to preserve case while trimming, including the existing mixed test's AbC expectation. Preserve empty-string handling, the 32-character input limit and TypeError/RangeError validation. Keep the one-argument API, all existing assertions and user drafts. Run node --test after the final edit. Do not commit or publish.`;
// Independent literal checks, not read from the author's tests or summary.
export function acceptanceSource(replaced) {
  return `const assert=require('node:assert/strict'), {normalize}=require('./index.cjs');
assert.equal(normalize('  AbC  '), ${JSON.stringify(replaced ? 'abc' : 'AbC')});
assert.equal(normalize('UPPER'), ${JSON.stringify(replaced ? 'upper' : 'UPPER')});
assert.equal(normalize('   '), '');
assert.equal(normalize('x'.repeat(32)), 'x'.repeat(32));
assert.throws(()=>normalize(null), TypeError);
assert.throws(()=>normalize('x'.repeat(33)), RangeError);
console.log('independent public acceptance passed');`;
}
