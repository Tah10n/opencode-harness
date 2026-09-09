function encodeComponent(text){
 if(typeof text!=='string')throw new TypeError('component');return encodeURIComponent(text).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
}
function decodeComponent(text){if(typeof text!=='string')throw new TypeError('component');return decodeURIComponent(text);}
export function renderQuery(entries){return entries.map(([key,value])=>encodeComponent(key)+'='+encodeComponent(value)).join('&');}
export function parseQuery(text){
 if(typeof text!=='string')throw new TypeError('query');if(text==='')return[];
 return text.split('&').map(part=>{const at=part.indexOf('=');if(at<0)throw new SyntaxError('missing =');return[decodeComponent(part.slice(0,at)),decodeComponent(part.slice(at+1))];});
}
