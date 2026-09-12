import {normalize} from 'node:path';import {pathToFileURL} from 'node:url';
export function run(args,write){
 if(args.length!==1){write('usage: path <value>\n');return 2;}
 if(typeof args[0]!=='string'||args[0].includes('\0'))throw new TypeError('path');
 write(normalize(args[0])+'\n');return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=run(process.argv.slice(2),text=>process.stdout.write(text));
