export function createLookup(transport){return function lookup(id,callback){transport.get(id,callback);};}
