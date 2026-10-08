export function parseArgs(args) {
 const options={tag:null,json:false};
 for(let i=0;i<args.length;i++) {
  if(args[i]==='--tag' && args[i+1]!==undefined) options.tag=args[++i];
  else if(args[i]==='--json') options.json=true;
  else throw new RangeError('Unknown or incomplete option: '+args[i]);
 }
 return options;
}
