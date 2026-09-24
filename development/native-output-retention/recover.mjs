// Copy existing stopped-workload data only. No OpenCode or provider execution.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {captureCandidate} from '../polybench-pilot/capture.mjs';import {outputRoot,privateJSON} from './output-files.mjs';import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
process.umask(0o077);
const out=path.resolve(process.argv[2]);
const saved=JSON.parse(fs.readFileSync(out+'/session/retained-resource.json'));
assert.match(saved.name,/^template-dev-[a-f0-9-]{36}$/);
const inspected=spawnSync('docker',['inspect',saved.name],{encoding:'utf8',timeout:5000});assert.equal(inspected.status,0,inspected.stderr);const identity=JSON.parse(inspected.stdout)[0];assert.equal(identity.Id,saved.containerID);assert.equal(identity.State.Running,true);assert.equal(identity.HostConfig.NetworkMode,'none');
const node=identity.Config.Cmd[0],relay=JSON.parse(fs.readFileSync(out+'/session/container.json'));assert.equal(relay.name,saved.name);assert.ok(['node','/diagnostic/node'].includes(node));
const exec=args=>spawnSync('docker',['exec','--workdir','/work/repo',saved.name,...(args[0]==='node'?[node,...args.slice(1)]:args)],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
assert.ok(Number.isSafeInteger(saved.relayPid)&&saved.relayPid>1,'Trusted retained relay PID required');
const relayState=exec(['node','-e',`const fs=require('fs');const stat=fs.readFileSync('/proc/${saved.relayPid}/stat','utf8');if(stat.slice(stat.lastIndexOf(') ')+2)[0]!=='T')throw Error('Retained relay is not suspended');`]);assert.equal(relayState.status,0,relayState.stderr);
const session={name:saved.name,exec,relayPid:saved.relayPid,arm:saved.arm??null,evidenceIdentity:{id:identity.Id,name:saved.name,root:outputRoot,node}};
assert.equal(stopWorkload(session).terminationVerified,true);
session.baseline=saved.baseline;assert.match(session.baseline,/^[a-f0-9]{40}$/);
// Restore missing accounting from the same database, never a new execution.
if(!fs.existsSync(out+'/native-evidence.json')){
 const native=exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);assert.equal(native.status,0,native.stderr);fs.writeFileSync(out+'/native-evidence.json',native.stdout,{flag:'wx',mode:0o600});
}
const result=captureCandidate(session,out);assert.equal(result.status,0,JSON.stringify(result));
const removal=spawnSync('docker',['rm','--force',session.name],{encoding:'utf8',timeout:15000});assert.equal(removal.status,0,removal.stderr);assert.notEqual(spawnSync('docker',['inspect',session.name],{encoding:'utf8'}).status,0);
privateJSON(out+'/recovery.json',{copiedExistingDataOnly:true,newProviderRequests:0,removed:session.name,result,at:new Date().toISOString()});console.log(JSON.stringify({recovered:true,removed:session.name,newProviderRequests:0}));
