export function parseArgs(args) { if(args.length!==1) throw new Error('Expected one input file'); return {file:args[0]}; }
