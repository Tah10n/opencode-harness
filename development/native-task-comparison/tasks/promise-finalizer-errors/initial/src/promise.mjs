export function wrap(value){const p=Promise.resolve(value);return {then(a,b){return wrap(p.then(a,b));},catch(fn){return wrap(p.catch(fn));}};}
