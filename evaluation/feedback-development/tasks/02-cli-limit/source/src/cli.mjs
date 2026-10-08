import {parseArgs} from './args.mjs';
import {select} from './query.mjs';
import {render} from './render.mjs';
export function runCLI(records,args) {
 const options=parseArgs(args);
 return render(select(records,options),options);
}
