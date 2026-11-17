import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(v=>JSON.parse(canonical(v)))
    : Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]))
  : value);
export const treeHash = tree => sha(canonical(tree));
export const limits = Object.freeze({files:64, bytes:524288, harnessFiles:12, harnessBytes:32768, fileBytes:8192});
export const allowed = name => name === 'systemprompt.md' || /^skills\/[a-z0-9][a-z0-9_-]*\/SKILL\.md$/.test(name);
export function validateHarness(tree, {base=false}={}) {
  if (!tree || Array.isArray(tree) || typeof tree !== 'object') throw Error('Harness must be a file mapping');
  if (!base && (!Object.keys(tree).length || !Object.values(tree).some(t=>typeof t==='string' && t.trim()))) throw Error('Empty proposal');
  if (Object.keys(tree).length > limits.harnessFiles) throw Error('Too many harness files');
  let size=0;
  for (const [name, text] of Object.entries(tree)) {
    if (!allowed(name) || typeof text!=='string' || text.includes('\0')) throw Error('Forbidden harness path/type: '+name);
    const bytes=Buffer.byteLength(text);size+=bytes;
    if (bytes>limits.fileBytes || size>limits.harnessBytes) throw Error('Harness size limit');
  }
  return treeHash(tree);
}
// No following symlinks, special files, hardlinks or executable model-supplied text.
export function readTree(root) {
  const tree=Object.create(null); let size=0;
  const visit=(dir,prefix='')=>{
    const ds=fs.lstatSync(dir);if(!ds.isDirectory()||ds.isSymbolicLink())throw Error('Unsafe directory');
    for(const name of fs.readdirSync(dir).sort()) {
      const file=path.join(dir,name),rel=prefix+name,s=fs.lstatSync(file);
      if(s.isDirectory())visit(file,rel+'/');
      else {
        if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.mode&0o111)throw Error('Unsafe file: '+rel);
        size+=s.size;if(size>limits.bytes||Object.keys(tree).length>=limits.files)throw Error('Input size limit');
        tree[rel]=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(fs.readFileSync(file));
      }
    }
  };visit(root);return tree;
}
export function writeTree(root,tree) {
  fs.mkdirSync(root,{recursive:true});
  for(const [rel,text] of Object.entries(tree)) {
    if(!rel || rel.startsWith('/') || rel.split('/').some(p=>!p||p==='.'||p==='..') || rel.includes('\\'))throw Error('Unsafe path');
    const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text,{flag:'wx'});
  }
}
export class Budget {
  constructor({milliseconds=600000,requests=120,roleRequests={solver:48,editor:32,composer:16,selector:8,auxiliary:16}}={}) {
    if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>3600000||!Number.isSafeInteger(requests)||requests<1||requests>1024)throw Error('Invalid budget');
    if(Object.keys(roleRequests).sort().join(',')!=='auxiliary,composer,editor,selector,solver'||Object.values(roleRequests).some(n=>!Number.isSafeInteger(n)||n<1||n>1024))throw Error('Invalid role allocation');
    this.policy={milliseconds,requests,roleRequests:{...roleRequests}};this.started=Date.now();this.deadline=this.started+milliseconds;
    this.startedMono=performance.now();this.deadlineMono=this.startedMono+milliseconds;
    this.counts=Object.fromEntries(Object.keys(roleRequests).map(k=>[k,0]));this.used=0;this.closed=null;
  }
  remaining() {return Math.min(this.deadline-Date.now(),this.deadlineMono-performance.now());}
  check() {if(this.closed)throw Error(this.closed);if(this.remaining()<=0)this.close('total_time_exhausted');}
  close(reason) {this.closed??=reason;throw Error(this.closed);}
  request(role) {this.check();if(this.used>=this.policy.requests||this.counts[role]>=this.policy.roleRequests[role])this.close('total_or_role_requests_exhausted');this.used++;this.counts[role]++;}
  report() {return {policy:this.policy,counts:this.counts,requests:this.used,elapsedMs:performance.now()-this.startedMono,closed:this.closed,tokens:'observed after response; no hard token cap'};}
}
