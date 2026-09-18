// Post-run facts only. Does not invoke a provider, compiler or author tool.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve('local/native-type-compat-offline-subscribe/batch'),read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex'),f=read(root+'/freeze.json');
assert.ok(fs.existsSync(root+'/outcome.json'));
for(const [p,h]of Object.entries(f.files))assert.equal(hash(fs.readFileSync(p)),h,p);
const rows=[];
for(const a of f.attempts){const d=root+'/runs/A-'+a.arm;if(!fs.existsSync(d)){rows.push({arm:a.arm,status:'not_started'});continue;}
 const e=read(d+'/native-evidence.json'),inventories=[];
 for(const file of fs.readdirSync(d).filter(n=>/^request-\d+\.json$/.test(n)).sort((a,b)=>+a.match(/\d+/)[0]-+b.match(/\d+/)[0])){const r=read(d+'/'+file),role=JSON.stringify(r).includes('Implement the complete original task')?'author':'parent';if(!r.tools?.length)continue;const names=r.tools.map(t=>t.name);assert.ok(!names.includes('webfetch'));for(const n of ['bash','read','apply_patch','glob','grep'])assert.ok(names.includes(n));inventories.push({file,role,tools:names,toolResults:r.input.filter(x=>x.type==='function_call_output').length,sha256:hash(fs.readFileSync(d+'/'+file))});}
 const tools=e.tools.map(t=>({callID:t.data.callID,tool:t.data.tool,sessionID:t.session_id,status:t.data.state.status,input:t.data.state.input,exit:t.data.state.metadata?.exit,time:t.data.state.time,output:t.data.state.output??t.data.state.error??null}));
 const messages=e.messages.filter(m=>m.data.role==='assistant').map(m=>({sessionID:m.session_id,finish:m.data.finish,time:m.data.time}));
 rows.push({arm:a.arm,status:'executed',inventories,tools,messages,sessions:e.sessions,stop:read(d+'/stop-verification.json')});
}
fs.writeFileSync(root+'/inspection.json',JSON.stringify({frozenFilesUnchanged:true,rows},null,2));console.log(JSON.stringify(rows.map(r=>({arm:r.arm,status:r.status,requests:r.inventories?.length,nativeTools:r.tools?.length,allInventoriesOffline:true}))));
