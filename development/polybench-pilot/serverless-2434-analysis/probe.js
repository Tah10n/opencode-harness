'use strict';
// Development diagnosis only. Actual project methods, local YAML, no plugin/deploy calls.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Serverless = require('/testbed/lib/Serverless');
const Service = require('/testbed/lib/classes/Service');
const YAML = require('/testbed/node_modules/js-yaml');
const arm = process.argv[2];
const results = [];
const error = e => ({ name: e.name, message: e.message, stack: e.stack });
function instance(config, file) {
  const dir = fs.mkdtempSync('/tmp/serverless-2434-');
  fs.writeFileSync(path.join(dir, 'serverless.yml'), YAML.dump(config));
  if (file) fs.writeFileSync(path.join(dir, 'events.yml'), YAML.dump(file));
  return new Serverless({ servicePath: dir });
}
async function scenario(name, config, file) {
  const s = instance(config, file);
  const r = { name, input: config, file, stages: [] };
  for (const [stage, fn] of [
    ['load', () => s.service.load()],
    ['populateService', () => s.variables.populateService()],
    ['postPopulateValidation', () => {
      // Existing historical production location; baseline has no late validation.
      if (arm === 'gold' || arm === 'H1') return s.service.validate();
      if (arm === 'H0') return s.service.validateFunctionEvents();
    }],
  ]) {
    try { await fn(); r.stages.push({ stage, outcome: 'returned' }); }
    catch (e) { r.stages.push({ stage, outcome: 'threw', error: error(e) }); break; }
  }
  r.functions = s.service.functions;
  results.push(r);
  return r;
}
(async () => {
  const base = { service: 'service-name', provider: 'aws' };
  const missing = await scenario('missing-functions', base);
  assert.deepStrictEqual(missing.functions, {});
  assert(missing.stages.every(x => x.outcome === 'returned'));
  const invalid = await scenario('literal-invalid-events', { ...base, functions: {
    functionA: { events: 'not an array or a variable' },
  } });
  assert.strictEqual(invalid.stages[invalid.stages.length - 1].error.name, 'ServerlessError');
  const object = await scenario('public-old-object-events', { ...base, functions: {
    functionA: { events: {} },
  } });
  assert.strictEqual(object.stages[object.stages.length - 1].error.name, 'ServerlessError');
  const events = [{ http: { path: 'users', method: 'get' } }];
  const good = await scenario('requested-file-array', { ...base, functions: {
    users: { handler: 'handlers/users/handler.users', events: '${file(./events.yml):events}' },
  } }, { events });
  if (arm === 'baseline') assert.strictEqual(good.stages[0].error.name, 'ServerlessError');
  else { assert(good.stages.every(x => x.outcome === 'returned'));
    assert.deepStrictEqual(good.functions.users.events, events); }
  const bad = await scenario('file-object-rejected', { ...base, functions: {
    users: { events: '${file(./events.yml):events}' },
  } }, { events: {} });
  assert.strictEqual(bad.stages[bad.stages.length - 1].error.name, 'ServerlessError');
  // Reproduce the evaluator's stale outer binding from the preceding public case.
  const previous = instance({ ...base, frameworkVersion: '>=1.0.0', functions: {} });
  previous.utils.getVersion = () => '1.2.2'; // Same version stub as the original test.
  const serviceInstance = new Service(previous);
  await serviceInstance.load();
  const current = instance(base);
  current.service = new Service(current);
  current.variables.service = current.service;
  const stale = { name: 'unmasked-independent-missing-functions-body',
    previousFunctions: serviceInstance.functions, sameInstance: serviceInstance === current.service };
  await current.service.load();
  current.variables.populateService();
  stale.currentFunctions = current.service.functions;
  try {
    serviceInstance.validate();
    assert.deepStrictEqual(serviceInstance.functions.functionA.events, {});
    stale.outcome = 'returned';
  } catch (e) { stale.outcome = 'threw'; stale.error = error(e); }
  assert.strictEqual(stale.outcome, 'threw');
  results.push(stale);
  console.log(JSON.stringify({ arm, assertions: 'passed', results }, null, 2));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
