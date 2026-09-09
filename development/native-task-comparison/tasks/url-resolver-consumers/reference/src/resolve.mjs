export function resolveLink(base,link){
 if((typeof base!=='string'&&!(base instanceof URL))||(typeof link!=='string'&&!(link instanceof URL)))throw new TypeError('URL input');
 const baseURL=new URL(base);if(!['http:','https:'].includes(baseURL.protocol))throw new TypeError('base protocol');
 const result=new URL(link,baseURL);if(!['http:','https:'].includes(result.protocol))throw new TypeError('link protocol');
 return result.href;
}
