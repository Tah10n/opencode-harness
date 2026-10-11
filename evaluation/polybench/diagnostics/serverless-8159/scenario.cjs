'use strict';
// Runs only inside the pinned, offline Serverless image. No hidden tests.
const assert = require('assert').strict;
const Serverless = require('/testbed/lib/Serverless');
const AwsProvider = require('/testbed/lib/plugins/aws/provider/awsProvider');
const ApiGateway = require('/testbed/lib/plugins/aws/package/compile/events/apiGateway');
const integration = require('/testbed/lib/plugins/aws/package/compile/events/apiGateway/lib/method/integration');
const JSON_TYPE = 'application/json';
const FORM_TYPE = 'application/x-www-form-urlencoded';
async function compile(request) {
  const options = { stage: 'dev', region: 'us-east-1' };
  const serverless = new Serverless();
  serverless.setProvider('aws', new AwsProvider(serverless, options));
  serverless.service.service = 'diagnostic';
  serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
  serverless.service.functions.First = {
    events: [{ http: { method: 'get', path: 'users/list', integration: 'lambda', request } }],
  };
  const api = new ApiGateway(serverless, options);
  api.validated = api.validate();
  api.apiGatewayMethodLogicalIds = [];
  api.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
  api.apiGatewayResources = { 'users/list': {
    name: 'UsersList', resourceLogicalId: 'ApiGatewayResourceUsersList',
  } };
  try {
    await api.compileMethods();
    const templates = serverless.service.provider.compiledCloudFormationTemplate.Resources
      .ApiGatewayMethodUsersListGet.Properties.Integration.RequestTemplates;
    return { keys: Object.keys(templates || {}).sort(),
      retainsDefaultJson: !!templates && templates[JSON_TYPE] ===
        integration.DEFAULT_JSON_REQUEST_TEMPLATE.replace('extraCognitoPoolClaims', ''),
      customJson: templates && templates[JSON_TYPE] === 'custom-json' };
  } catch (error) {
    return { error: error.name, message: error.message };
  }
}
(async () => {
  const arm = process.argv[2];
  assert(['baseline', 'P', 'C', 'T'].includes(arm));
  const results = {};
  results.defaults = await compile({});
  results.custom = await compile({ template: { [JSON_TYPE]: 'custom-json' } });
  results.selectiveNull = await compile({ template: { [FORM_TYPE]: null } });
  results.documentedRemoval = await compile({ template:
    arm === 'C' ? false : arm === 'T' ? {} : { [FORM_TYPE]: null } });
  assert.deepEqual(results.defaults.keys, [JSON_TYPE, FORM_TYPE]);
  assert.equal(results.defaults.retainsDefaultJson, true);
  assert.deepEqual(results.custom.keys, [JSON_TYPE, FORM_TYPE]);
  assert.equal(results.custom.customJson, true);
  if (arm === 'P') {
    assert.deepEqual(results.selectiveNull.keys, [JSON_TYPE]);
    assert.equal(results.selectiveNull.retainsDefaultJson, true);
    assert.deepEqual(results.documentedRemoval, results.selectiveNull);
  } else {
    assert.equal(results.selectiveNull.error, 'TypeError');
    assert.match(results.selectiveNull.message, /replace/);
    if (arm !== 'baseline') {
      assert.deepEqual(results.documentedRemoval.keys, []);
      assert.equal(results.documentedRemoval.retainsDefaultJson, false);
    }
  }
  console.log(JSON.stringify({ arm, results }));
})().catch(error => { console.error(error); process.exitCode = 1; });
