// Reproduce the privacy edge found in the frozen preservation source review.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {adapterFor} from '/workspace/packages/connector/lib/readers.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ledger-privacy-'));
try {
  const id='0123456789abcdef'.repeat(4),file=path.join(root,'session.jsonl');
  await fs.writeFile(file,JSON.stringify({type:'assistant',timestamp:'2026-08-10T12:00:00Z',message:{role:'assistant',id,usage:{input_tokens:10,output_tokens:5}}})+'\n');
  const source={dataPath:root,sourceId:'11111111-1111-4111-8111-111111111111',agentId:'claude_code'};
  const result=await adapterFor('claude_code').collect(source,{rangeStart:'2026-07-15',rangeEnd:'2026-08-14'},{});
  const state=JSON.parse(JSON.stringify(result.nextState));
  console.log(JSON.stringify({case:'valid-64-hex-provider-id',total:result.entries[0]?.totalTokens,completeness:result.completeness,expectedRawIdPersisted:false,rawIdPersisted:JSON.stringify(state).includes(id)},null,2));
} finally {await fs.rm(root,{recursive:true,force:true});}
