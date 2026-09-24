// Experiment-only native hooks. No command parsing, grader or product workflow changes.
import fs from 'node:fs';
import path from 'node:path';
export default async function selectionPlugin() {
 const deadline=()=>JSON.parse(fs.readFileSync('/work/selection-clock.json'));
 return {
  'tool.execute.before':async(input,output)=>{
   const remaining=deadline().researchDeadline-Date.now()-1000;
   if(remaining<=0)throw Error('Research is closed. Finish the decision from existing observations; no more tools.');
   if(input.tool==='bash')output.args.timeout=Math.max(1,Math.min(output.args.timeout??120000,remaining));
  },
  'shell.env':async(input,output)=>{
   const cwd=path.resolve(input.cwd);
   const label=['X','Y','base'].find(x=>cwd===`/input/${x}`||cwd.startsWith(`/input/${x}/`)||cwd===`/work/diagnostics/${x}`||cwd.startsWith(`/work/diagnostics/${x}/`));
   if(!label)throw Error('Use bash workdir /input/X, /input/Y or /input/base; execute each candidate separately.');
   const root=`/work/diagnostics/${label}`;
   Object.assign(output.env,{HOME:root+'/home',TMPDIR:root+'/tmp',XDG_CONFIG_HOME:root+'/config',XDG_DATA_HOME:root+'/data',XDG_CACHE_HOME:root+'/cache',XDG_STATE_HOME:root+'/state',COREPACK_HOME:'/template/corepack'});
  },
 };
}
