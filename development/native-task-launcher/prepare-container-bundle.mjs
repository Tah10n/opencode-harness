import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// The preparation already verified by installation-control, kept in one place.
// Never mutate the source bundle or make the read-only /template mount writable.
export function prepareContainerBundle(source, destination) {
  if(fs.existsSync(destination))throw Error('Prepared bundle destination already exists');
  fs.cpSync(source,destination,{recursive:true});
  const configPath=path.join(destination,'opencode.json');
  const config=JSON.parse(fs.readFileSync(configPath));
  const mapped=file=>{
    const local=file.startsWith('file:')?fileURLToPath(file):file;
    const relative=path.relative(source,local);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Config reference is outside source bundle');
    const target=path.join(destination,relative);
    if(!fs.statSync(target).isFile())throw Error('Missing config file: '+relative);
    fs.accessSync(target,fs.constants.R_OK);
    return '/template/'+relative.split(path.sep).join('/');
  };
  config.instructions=config.instructions.map(mapped);
  config.plugin=config.plugin.map(file=>'file://'+mapped(file));
  fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
  fs.writeFileSync(path.join(destination,'.gitignore'),'node_modules\npackage.json\npackage-lock.json\n');
  for(const name of ['node_modules','package.json','package-lock.json','rg'])fs.accessSync(path.join(destination,name),fs.constants.R_OK);
  return config;
}
