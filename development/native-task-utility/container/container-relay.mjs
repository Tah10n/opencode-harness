// Benchmark transport only. No credentials, external network or custom tools.
import http from 'node:http';
import fs from 'node:fs';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

for (const name of ['home','tmp','repo','config','data','cache','state']) fs.mkdirSync(`/work/${name}`);
fs.cpSync('/input', '/work/repo', { recursive: true });
const git = argv => {
  const r=spawnSync('git',argv,{cwd:'/work/repo',encoding:'utf8'});
  if(r.status!==0)throw Error(`git preparation failed: ${r.stderr}`);
};
git(['init','-q']);
git(['add','.']);
git(['-c','core.hooksPath=/dev/null','-c','user.name=Development','-c','user.email=development@localhost','commit','--allow-empty','-qm','Prepared baseline']);
if(fs.existsSync('/template/core.md')) {
  fs.mkdirSync('/work/template');
  fs.copyFileSync('/template/core.md','/work/template/core.md');
  fs.writeFileSync('/work/template/opencode.json',JSON.stringify({$schema:'https://opencode.ai/config.json',instructions:['/work/template/core.md']}));
}
let nextId=0;
const pending=new Map();
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const server=http.createServer(async(req,res)=>{
  if(req.method!=='POST'||!['/v1/responses','/v1/chat/completions'].includes(req.url)||pending.size>=4){res.writeHead(403).end();return;}
  const id=String(++nextId);let size=0;const chunks=[];
  try {
    for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw Error('request too large');chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks));
    const timeout=setTimeout(()=>{res.destroy();pending.delete(id);emit({type:'cancel',id});},180000);
    pending.set(id,{res,timeout,bytes:0});
    res.once('close',()=>{clearTimeout(timeout);pending.delete(id);if(!res.writableEnded)emit({type:'cancel',id});});
    emit({type:'request',id,path:req.url,body});
  }catch{res.writeHead(400).end();}
});
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{
  try {
    const frame=JSON.parse(line),item=pending.get(frame.id);if(!item)return;
    if(frame.type==='headers')item.res.writeHead(frame.status,{'content-type':frame.contentType});
    else if(frame.type==='chunk'){
      const bytes=Buffer.from(frame.data,'base64');item.bytes+=bytes.length;
      if(item.bytes>64*1024*1024)throw Error('response too large');
      item.res.write(bytes);
    }else if(frame.type==='end'){clearTimeout(item.timeout);item.res.end();pending.delete(frame.id);}
    else if(frame.type==='error'){item.res.destroy();clearTimeout(item.timeout);pending.delete(frame.id);}
  }catch{process.exitCode=1;server.closeAllConnections();server.close();input.close();}
});
input.on('close',()=>{server.closeAllConnections();server.close();});
server.listen(4099,'127.0.0.1',()=>emit({type:'ready',pid:process.pid}));
