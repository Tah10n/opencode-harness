export function getSetting(settings,key,fallback,options={}){
 if(Object.hasOwn(settings,key))return settings[key];
 if(options.lazy===true)return fallback(key);
 return fallback;
}
