const QUnit = global.QUnit;
QUnit.module('Maths', () => {
  QUnit.module('Color', () => {
    if (process.env.TAP_FIXTURE_MODE !== 'original') {
      QUnit.test('harmless', assert => assert.strictEqual(2 + 2, 4));
    }
    QUnit.test('decimal 50.0%', assert => {
      assert.strictEqual(process.env.TAP_FIXTURE_MODE === 'defective' ? 50 : 50.5, 50.5);
    });
    QUnit.test('preserved 360', assert => assert.strictEqual(360, 360));
  });
});
