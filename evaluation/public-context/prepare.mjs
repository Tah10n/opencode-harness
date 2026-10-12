import {parseArgs} from 'node:util';
import {prepare} from './context.mjs';
try {
  const {values:v}=parseArgs({options:{task:{type:'string'},metadata:{type:'string'},snapshot:{type:'string'},'snapshot-sha256':{type:'string'},'fetch-public':{type:'boolean'},disabled:{type:'boolean'},out:{type:'string'}}});
  console.log(JSON.stringify(prepare({taskFile:v.task,metadataFile:v.metadata,snapshotFile:v.snapshot,snapshotSha256:v['snapshot-sha256'],fetchPublic:v['fetch-public'],disabled:v.disabled,out:v.out})));
}catch(error){console.error(JSON.stringify({status:'blocked',reason:error.message}));process.exitCode=1;}
