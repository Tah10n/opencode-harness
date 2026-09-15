import {pathToFileURL} from 'node:url';
import {normalizePosix} from './posix-path.mjs';
export function run(args,write){
 if(args.length!==1){write('usage: path <value>\n');return 2;}
 const result=normalizePosix(args[0]);write(result+'\n');return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=run(process.argv.slice(2),text=>process.stdout.write(text));
