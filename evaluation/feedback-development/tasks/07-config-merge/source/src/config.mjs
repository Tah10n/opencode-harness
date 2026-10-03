export function mergeConfig(defaults,overrides) {
 for(const [key,value] of Object.entries(overrides)) {
  if(value===undefined)continue;
  if(value && !Array.isArray(value) && typeof value==='object' && defaults[key] && typeof defaults[key]==='object') Object.assign(defaults[key],value);
  else defaults[key]=value;
 }
 return defaults;
}
