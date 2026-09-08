// Installed native-session workflow fixture: control-flow evidence, zero model-quality claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { materializeNativeTemplate } from '../lib/native-template.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-task-fixture-'));
for (const name of ['home', 'config', 'data', 'cache', 'state', 'project']) fs.mkdirSync(path.join(temp, name));
const project = path.join(temp, 'project'), bundle = path.join(temp, 'bundle'), task = path.join(temp, 'task.txt');
const git = (...args) => { const r = spawnSync('git', args, { cwd: project, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
git('init', '-q');
fs.writeFileSync(path.join(project, 'value.mjs'), 'export const value = 2;\n');
fs.writeFileSync(path.join(project, 'value.test.mjs'), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; import {test} from 'node:test'; test('public requirement',()=>assert.equal(value,2));\n");
fs.writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({ permission: { task: 'allow', bash: 'allow' } }));
git('add', '.'); git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'base');
materializeNativeTemplate({ repositoryRoot: root, outputDirectory: bundle, task: true, review: true });
const pluginPath=path.join(bundle,'native-task-plugin.mjs');fs.writeFileSync(pluginPath,fs.readFileSync(pluginPath,'utf8').replace("parts: [{ type: 'text', text: text +","...(schema ? {format:{type:'json_schema',schema,retryCount:0}} : {}), parts: [{ type: 'text', text: text +"));
let providerRequests=0,parentCalled=false;
const fixture=http.createServer(async(req,res)=>{const xs=[];for await(const x of req)xs.push(x);const body=JSON.parse(Buffer.concat(xs));providerRequests++;const structured=body.tools?.find(x=>x.function.name==='StructuredOutput');const base={id:'probe',object:'chat.completion.chunk',created:1,model:'fixture'};const bootstrap=!structured&&body.tools?.some(x=>x.function.name==='harness_task')&&!parentCalled;if(bootstrap)parentCalled=true;const delta=bootstrap?{role:'assistant',tool_calls:[{index:0,id:'bootstrap',type:'function',function:{name:'harness_task',arguments:'{}'}}]}:structured?{role:'assistant',tool_calls:[{index:0,id:'native-structured',type:'function',function:{name:'StructuredOutput',arguments:JSON.stringify({answer:'observed'})}}]}:{role:'assistant',content:'probe'};res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:structured||bootstrap?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);});
await new Promise(r => fixture.listen(0, '127.0.0.1', r));
const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const config = { model: 'local-fixture/fixture', small_model: 'local-fixture/fixture', provider: { 'local-fixture': { npm: '@ai-sdk/openai-compatible', name: 'Scripted fixture', options: { baseURL: `http://127.0.0.1:${fixture.address().port}/v1`, apiKey: 'not-a-credential' }, models: { fixture: { name: 'fixture', limit: { context: 200000, output: 10000 } } } } } };
const env = { PATH: process.env.PATH, HOME: path.join(temp, 'home'), TMPDIR: os.tmpdir(), ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(n => [`XDG_${n.toUpperCase()}_HOME`, path.join(temp, n)])), OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_CONFIG_DIR: bundle, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), HARNESS_TASK_FILE: task, HARNESS_TASK_TIMEOUT_MS: '45000' };
const child = spawn(process.env.OPENCODE_BIN ?? 'opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', x => { stderr += x; fs.writeFileSync(path.join(temp, 'server.log'), stderr); }); child.stdout.resume();
const api = async (method, route, body) => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) }); if (!r.ok) throw Error(await r.text()); return r.json(); };
try {
 for(let n=0;n<150;n++){try{await api('GET','/global/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const schema={type:'object',properties:{answer:{type:'string',description:'Observed answer'}},required:['answer'],additionalProperties:false};const results=[];
 await api('GET','/command');
 const {createOpencodeClient}=await import(new URL('file://'+path.join(temp,'config/opencode/node_modules/@opencode-ai/sdk/dist/client.js')).href);
 const sdk=createOpencodeClient({baseUrl:`http://127.0.0.1:${port}`,fetch:async(input,init)=>{const req=new Request(input,init);const bytes=req.method==='POST'?await req.clone().text():'';if(bytes.includes('json_schema'))fs.writeFileSync(path.join(temp,'sdk-request.json'),bytes);return fetch(req);}});
 for(const retryCount of [undefined,0]){const session=await api('POST','/session',{});const body={model:{providerID:'local-fixture',modelID:'fixture'},agent:'build',format:{type:'json_schema',schema,...(retryCount===undefined?{}:{retryCount})},parts:[{type:'text',text:'Return answer observed using the required structured output.'}]};fs.writeFileSync(path.join(temp,'request-'+String(retryCount)+'.json'),JSON.stringify(body));try{const result=await api('POST',`/session/${session.id}/message`,body);results.push({transport:'http',retryCount,result});}catch(e){results.push({transport:'http',retryCount,error:e.message});}}
 const session=await api('POST','/session',{});const result=await sdk.session.prompt({path:{id:session.id},body:{model:{providerID:'local-fixture',modelID:'fixture'},format:{type:'json_schema',schema,retryCount:0},parts:[{type:'text',text:'Return answer observed.'}]}});results.push({transport:'installed-sdk',data:result.data,error:result.error});
 parentCalled=false;fs.writeFileSync(task,'Run the project test and preserve value 2.');const parent=await api('POST','/session',{});await api('POST',`/session/${parent.id}/command`,{command:'harness-task',arguments:'',model:'local-fixture/fixture'});const messages=await api('GET',`/session/${parent.id}/message`);results.push({transport:'plugin-sdk-child',tool:messages.flatMap(m=>m.parts).find(p=>p.tool==='harness_task')});
 fs.writeFileSync(path.join(temp,'probe-results.json'),JSON.stringify({providerRequests,results},null,2));for(const r of results.slice(0,3))assert.deepEqual((r.result??r.data)?.info?.structured,{answer:'observed'});assert.match(results[3].tool.state.output,/Expected OutputFormatJsonSchema/);console.log(JSON.stringify({passed:true,installedVersion:'1.18.26',httpStructured:true,sdkStructured:true,embeddedChildReproduced:true,scriptedRequests:providerRequests,realProviderRequests:0,temp}));
} finally {
  if (child.exitCode === null) await new Promise(resolve => { const timer = setTimeout(() => child.kill('SIGKILL'), 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); });
  fixture.closeAllConnections(); await new Promise(r => fixture.close(r));
}
