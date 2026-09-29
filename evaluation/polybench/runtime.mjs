// Public pinned installation only. No credentials or inference.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
const local=path.resolve('local/polybench'), candidate=process.cwd();
const model=process.env.POLYBENCH_MODEL,variant=process.env.POLYBENCH_VARIANT;
if(!/^openai\/[^/\s]+$/.test(model??'')||!variant)throw Error('Set POLYBENCH_MODEL and POLYBENCH_VARIANT explicitly');
const runtimeSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const assertClean=()=>{if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==runtimeSha)throw Error('Runtime source must remain at a clean fixed HEAD');};
assertClean();
fs.mkdirSync(local,{recursive:true});
for(const dir of ['bundle','plain-dependencies']){
 const target=local+'/'+dir;if(fs.existsSync(target))throw Error('Preserve existing preparation: '+target);
 if(dir==='bundle')materializeNativeTemplate({repositoryRoot:candidate,outputDirectory:target,task:true});
 else {fs.mkdirSync(target);fs.writeFileSync(target+'/package.json',JSON.stringify({private:true,dependencies:{'@opencode-ai/plugin':'1.18.26',typescript:'6.0.3'}}));}
 execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund','--prefix',target],{stdio:'inherit'});
}
const cfg=JSON.parse(fs.readFileSync(local+'/bundle/opencode.json'));cfg.instructions=['/template/core.md'];cfg.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(local+'/bundle/opencode.json',JSON.stringify(cfg,null,2));
const toolchain=local+'/toolchain';fs.mkdirSync(toolchain);
const packedResult=JSON.parse(execFileSync('npm',['pack','opencode-linux-arm64@1.18.26','--ignore-scripts','--json','--pack-destination',toolchain],{encoding:'utf8'}));
const packed=Array.isArray(packedResult)?packedResult[0]:packedResult['opencode-linux-arm64'];
if(packed?.filename!=='opencode-linux-arm64-1.18.26.tgz')throw Error('Unexpected pinned npm pack result');
execFileSync('tar',['-xzf',toolchain+'/'+packed.filename,'-C',toolchain]);fs.unlinkSync(toolchain+'/'+packed.filename);
const name=model.slice('openai/'.length);
const config={
 model,small_model:model,
 provider:{openai:{options:{baseURL:'http://127.0.0.1:4099/v1',apiKey:'relay-only'},models:{[name]:{options:{reasoningEffort:variant},variants:{[variant]:{reasoningEffort:variant}}}}}},
 permission:{external_directory:{'*':'deny','/template/node_modules/typescript/lib/*':'allow','/diagnostic/*':'allow'},webfetch:'deny'},
};
fs.writeFileSync(local+'/experiment-config.json',JSON.stringify(config,null,2));
assertClean();
fs.writeFileSync(local+'/runtime.json',JSON.stringify({sha:runtimeSha,model,variant,opencode:'1.18.26'},null,2));
console.log('Current native bundle and pinned Linux ARM64 tools prepared; provider requests: 0');
