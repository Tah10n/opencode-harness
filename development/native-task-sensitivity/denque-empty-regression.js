var assert = require('assert'); var Denque = require('../');
describe('removeWhere on an empty queue', function () {
  it('does not invoke the predicate and remains reusable', function () {
    var queue = new Denque([], {capacity: 2});
    assert.strictEqual(queue.removeWhere(function () { throw new Error('No original entries to visit'); }), 0);
    queue.push('a'); queue.push('b'); queue.push('c');
    assert.deepStrictEqual(queue.toArray(), ['b', 'c']);
  });
});
