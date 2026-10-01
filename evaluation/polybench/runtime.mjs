// Public pinned installation only. No credentials or inference.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {local,campaign,qualityCampaign,qualityTemplates} from './campaign.mjs';
const quality=qualityCampaign(campaign?.name);
const candidate=campaign?local+'/product':process.cwd();
if(campaign){
 fs.mkdirSync(candidate,{recursive:true});
 if(fs.readdirSync(candidate).length)throw Error('Product extraction already exists');
 const archive=execFileSync('git',['archive',campaign.product_sha],{maxBuffer:32*1024*1024});
 execFileSync('tar',['-xf','-','-C',candidate],{input:archive});
}
const {materializeNativeTemplate}=await import(pathToFileURL(candidate+'/lib/native-template.mjs'));
let controlMaterializer,control;
if(quality&&campaign.arms.includes('C0')){
 control=local+'/control-product';fs.mkdirSync(control);
 const archive=execFileSync('git',['archive',campaign.arm_products.C0,'lib/native-template.mjs','profiles/native/core.md']);
 execFileSync('tar',['-xf','-','-C',control],{input:archive});
 controlMaterializer=(await import(pathToFileURL(control+'/lib/native-template.mjs'))).materializeNativeTemplate;
}
const model=process.env.POLYBENCH_MODEL,variant=process.env.POLYBENCH_VARIANT;
if(!/^openai\/[^/\s]+$/.test(model??'')||!variant)throw Error('Set POLYBENCH_MODEL and POLYBENCH_VARIANT explicitly');
const adapterSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const runtimeSha=campaign?.product_sha??adapterSha;
const assertClean=()=>{if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==adapterSha)throw Error('Runtime source must remain at a clean fixed HEAD');};
if(!campaign)assertClean();
fs.mkdirSync(local,{recursive:true});
const bundleDirectories=quality?['bundle','plain-dependencies',...(control?['core-bundle']:[]),'candidate-core-bundle']:campaign?['bundle','core-bundle','plain-dependencies']:['bundle','plain-dependencies'];
const cacheArgs=campaign?['--cache',local+'/npm-cache']:[];
for(const dir of bundleDirectories){
 const target=local+'/'+dir;if(fs.existsSync(target))throw Error('Preserve existing preparation: '+target);
 if(dir==='core-bundle'&&quality)controlMaterializer({repositoryRoot:control,outputDirectory:target});
 else if(dir==='bundle'||dir==='core-bundle'||dir==='candidate-core-bundle')materializeNativeTemplate({repositoryRoot:candidate,outputDirectory:target,task:dir==='bundle'});
 else {fs.mkdirSync(target);fs.writeFileSync(target+'/package.json',JSON.stringify({private:true,dependencies:{'@opencode-ai/plugin':'1.18.26',typescript:'6.0.3'}}));}
 if(dir==='core-bundle'||dir==='candidate-core-bundle')continue;
 execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',...cacheArgs,'--prefix',target],{stdio:'inherit'});
}
if(campaign){
 // OpenCode normally creates this startup file; pre-create it for a read-only mount.
 for(const directory of bundleDirectories.filter(name=>name.endsWith('core-bundle'))){
  fs.copyFileSync(local+'/bundle/.gitignore',local+'/'+directory+'/.gitignore');
  const core=JSON.parse(fs.readFileSync(local+'/'+directory+'/opencode.json'));core.instructions=['/template/core.md'];fs.writeFileSync(local+'/'+directory+'/opencode.json',JSON.stringify(core,null,2));
  for(const name of ['node_modules','package.json','package-lock.json'])fs.cpSync(local+'/plain-dependencies/'+name,local+'/'+directory+'/'+name,{recursive:true,verbatimSymlinks:true});
 }
}
const cfg=JSON.parse(fs.readFileSync(local+'/bundle/opencode.json'));cfg.instructions=['/template/core.md'];cfg.plugin=['file:///template/native-task-plugin.mjs'];fs.writeFileSync(local+'/bundle/opencode.json',JSON.stringify(cfg,null,2));
const toolchain=local+'/toolchain';fs.mkdirSync(toolchain);
const packedResult=JSON.parse(execFileSync('npm',['pack','opencode-linux-arm64@1.18.26','--ignore-scripts','--json',...cacheArgs,'--pack-destination',toolchain],{encoding:'utf8'}));
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
if(!campaign)assertClean();
const templates=quality?qualityTemplates(campaign):null;
fs.writeFileSync(local+'/runtime.json',JSON.stringify({sha:runtimeSha,adapterSha,model,variant,opencode:'1.18.26',...(quality?{templates,armModes:campaign.arm_modes,armProducts:campaign.arm_products,bundleDirectories}:{} )},null,2));
console.log('Current native bundle and pinned Linux ARM64 tools prepared; provider requests: 0');
