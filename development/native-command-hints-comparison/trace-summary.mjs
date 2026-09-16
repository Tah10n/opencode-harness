// Visible tool facts and assistant text only; never extract reasoning items.
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('local/native-command-hints-comparison/batch'),f=JSON.parse(fs.readFileSync(root+'/freeze.json')),rows=[];
for(const a of f.attempts){const dir=root+'/runs/'+a.task+'-'+a.arm;if(!fs.existsSync(dir))continue;
 const base=dir+'/candidate/.git/harness-task',artifact=base+'/'+fs.readdirSync(base)[0],events=JSON.parse(fs.readFileSync(artifact+'/tool-events.json'));
 const hint=fs.existsSync(artifact+'/command-hint.json')?JSON.parse(fs.readFileSync(artifact+'/command-hint.json')):null;
 const commands=events.map((e,index)=>({index:index+1,callID:e.callID,tool:e.tool,command:e.args?.command??null,path:e.args?.filePath??null,patchPaths:e.args?.patchText?.split('\n').filter(l=>/^\*\*\* (Add|Update|Delete) File:/.test(l)),exit:e.exit??null,state:e.state,changed:e.before!==e.after,before:e.before,after:e.after,output:e.output??null,startedAt:e.startedAt,completedAt:e.completedAt}));
 const native=JSON.parse(fs.readFileSync(dir+'/native-evidence.json'));
 const visibleTool=hint?native.tools.find(t=>t.data?.callID===hint.callID||t.data?.callId===hint.callID):null;
 const persistedHint=hint?native.tools.find(t=>typeof t.data?.state?.output==='string'&&t.data.state.output.includes('Host-derived project command context:')):null;
 const receipt={wireRequestArchived:false,nativeToolMessage:persistedHint?.data??visibleTool?.data??null,limitation:'Real raw HTTP payload/stream capture omitted for this experiment kind; native persisted output is not wire receipt proof.'};
 const result=JSON.parse(fs.readFileSync(artifact+'/result.json'));
 const finalAuthor=result.authorSummary;
 const cli=fs.readFileSync(dir+'/session/events.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l));
 const finalParent=cli.filter(e=>e.type==='text').map(e=>e.part?.text).filter(Boolean).at(-1)??null;

 rows.push({slot:a.slot,task:a.task,arm:a.arm,artifact:path.relative(root,artifact),hint,receipt,commands,finalAuthor,finalParent});
}
fs.writeFileSync(root+'/trace-summary.json',JSON.stringify(rows,null,2)+'\n');
console.log('Saved visible trace summary for '+rows.length+' attempts.');
