// Host only. The participant and its recordings never receive credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {AsyncLocalStorage} from 'node:async_hooks';
import {nativeAuthLoader} from './vendor/native-auth.mjs';

const readinessURL='https://opencode-auth-readiness.invalid/host-only';
const refreshURL='https://auth.openai.com/oauth/token';
export class ConnectionError extends Error {
  constructor(reason,code){super('Existing OpenCode connection: '+reason+(code?' ('+code+')':''));this.name='ConnectionError';this.reason=reason;}
}
export function authSource({env=process.env,home=os.homedir()}={}) {
  const data=env.XDG_DATA_HOME&&path.isAbsolute(env.XDG_DATA_HOME)?env.XDG_DATA_HOME:path.join(home,'.local/share');
  let kind='file';
  if(env.OPENCODE_AUTH_CONTENT)try{JSON.parse(env.OPENCODE_AUTH_CONTENT);kind='environment';}catch{} // Native Auth.all falls back only for malformed JSON.
  return {kind,file:path.join(data,'opencode/auth.json')};
}
export function existingConnection({env=process.env,home=os.homedir(),providerID='openai',fetchImpl=fetch}={}) {
  if(providerID!=='openai')throw new ConnectionError('unsupported-provider');
  const source=authSource({env,home}),context=new AsyncLocalStorage();
  let loader,environmentRaw,environmentStore,refreshCalls=0;
  const readStore=()=>{
    try {
      if(source.kind==='environment') {
        if(environmentRaw!==env.OPENCODE_AUTH_CONTENT){environmentRaw=env.OPENCODE_AUTH_CONTENT;environmentStore=JSON.parse(environmentRaw);}
        return environmentStore;
      }
      return JSON.parse(fs.readFileSync(source.file,'utf8'));
    }catch(error){throw new ConnectionError(error.code==='EACCES'||error.code==='EPERM'?'source-inaccessible':error.code==='ENOENT'?'source-missing':'source-invalid',error.code);}
  };
  const getAuth=()=>{
    const a=readStore()?.[providerID];
    if(a?.type!=='oauth')throw new ConnectionError('oauth-record-missing');
    if(typeof a.refresh!=='string'||!a.refresh||!Number.isFinite(a.expires)||a.expires<0)throw new ConnectionError('required-refresh-fields-missing');
    return {...a};
  };
  const requireReady=a=>{
    if(typeof a.access!=='string'||!a.access||typeof a.accountId!=='string'||!a.accountId)throw new ConnectionError('required-access-fields-missing');
    if(a.expires<=Date.now())throw new ConnectionError('access-expired');
    return a;
  };
  const setAuth=async body=>{
    requireReady(body);
    const all=readStore();
    const next={...all,[providerID]:body};
    try{fs.writeFileSync(source.file,JSON.stringify(next),{mode:0o600});}
    catch(error){throw new ConnectionError('native-refresh-persistence-failed',error.code);}
    if(source.kind==='environment')environmentStore=next;
  };
  const nativeFetch=async(url,init)=>{
    const href=url instanceof URL?url.href:typeof url==='string'?url:url.url;
    const signal=context.getStore()?.signal;
    signal?.throwIfAborted();
    if(href===readinessURL)return new Response(null,{status:204}); // Local interception, no HTTP/inference probe.
    if(href!==refreshURL)throw new ConnectionError('unexpected-native-auth-url');
    refreshCalls++;
    return fetchImpl(url,{...init,redirect:'error',signal});
  };
  const safeStatus=()=>{
    const a=getAuth();
    return {providerID,sourceKind:source.kind,type:a.type,accessPresent:!!a.access,refreshPresent:!!a.refresh,accountFieldPresent:!!a.accountId,expiresUTC:new Date(a.expires).toISOString(),expired:a.expires<=Date.now(),authRefreshCalls:refreshCalls,inferenceRequests:0};
  };
  const read=async({signal=AbortSignal.timeout(30000)}={})=>{
    signal.throwIfAborted();
    loader??=nativeAuthLoader({getAuth,setAuth,fetch:nativeFetch});
    try{await context.run({signal},async()=>{const hook=await loader;await hook.fetch(readinessURL,{method:'HEAD',signal});});}
    catch(error){if(error instanceof ConnectionError)throw error;throw new ConnectionError(signal.aborted?'native-refresh-cancelled':'native-refresh-failed',error.code);}
    signal.throwIfAborted();
    const a=requireReady(getAuth());
    return {access:a.access,accountId:a.accountId};
  };
  return {source,read,safeStatus,assertStoredReady:()=>{requireReady(getAuth());return safeStatus();},readiness:async options=>{await read(options);return safeStatus();}};
}
