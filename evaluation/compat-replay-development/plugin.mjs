// Installed only in the experimental evaluation bundle, never the materializer.
import nativeTaskPlugin from '../../lib/native-task-plugin.mjs';
import {probe,addObservation,pinInputs} from './probe.mjs';
export default async function compatPlugin(context) {
  if(process.env.COMPAT_REPLAY_PROBE!=='1')return nativeTaskPlugin(context);
  // /input is the shared read-only public source admitted before participant work.
  const pins=pinInputs('/input');
  return nativeTaskPlugin(context,{observeExperimental:({facts,directory,snapshot,remainingMs,save})=>{
    const result=probe({baseline:'/input',candidate:directory,pins,snapshotSha256:snapshot.snapshotSha256,remainingMs});
    save('compat-'+snapshot.snapshotSha256+'.json',result);
    return addObservation(facts,result,snapshot.snapshotSha256);
  }});
}
