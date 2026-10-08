import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBundle} from '../feedback-development/assets.mjs';
import {directory} from './suite.mjs';
import {manifest} from '../support/manifest.mjs';
const installedSource=name=>fs.readFileSync(path.join(directory,name),'utf8').replace("from '../../lib/native-task-plugin.mjs'","from '../native-task-plugin.mjs'");
export function attachProbe(bundle,executionImage) {
  validateBundle(bundle,{executionImage});
  const dest=path.join(bundle,'compat');fs.mkdirSync(dest);
  for(const file of ['plugin.mjs','probe.mjs','worker.mjs'])fs.writeFileSync(path.join(dest,file),installedSource(file));
  const file=path.join(bundle,'opencode.json'),config=JSON.parse(fs.readFileSync(file));
  config.plugin=['file:///template/compat/plugin.mjs'];fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))attachProbe(process.argv[2],process.env.EVALUATION_IMAGE);

export async function validateExperimentBundle(bundle) {
  const {materializeNativeTemplate}=await import('../../lib/native-template.mjs');
  const {portableConfig}=await import('../feedback-development/assets.mjs');
  const {repository}=await import('./suite.mjs');
  const os=await import('node:os');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'compat-bundle-check-'));
  try {
    const expected=path.join(temp,'bundle');materializeNativeTemplate({repositoryRoot:repository,outputDirectory:expected,task:true});
    const actual=manifest(bundle);for(const [name,entry] of Object.entries(manifest(expected)).filter(([n])=>n!=='opencode.json'))if(JSON.stringify(entry)!==JSON.stringify(actual[name]))throw Error('Stale native bundle: '+name);
    const config=portableConfig(JSON.parse(fs.readFileSync(path.join(expected,'opencode.json'))));config.plugin=['file:///template/compat/plugin.mjs'];
    if(JSON.stringify(config)!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')))))throw Error('Changed experimental config');
    for(const name of ['plugin.mjs','probe.mjs','worker.mjs'])if(!Buffer.from(installedSource(name)).equals(fs.readFileSync(path.join(bundle,'compat',name))))throw Error('Stale experimental bundle: '+name);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
