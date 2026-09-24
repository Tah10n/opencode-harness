export function encodeComponent(text){
 if(typeof text!=='string')throw new TypeError('component');return encodeURIComponent(text).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
}
export function decodeComponent(text){if(typeof text!=='string')throw new TypeError('component');return decodeURIComponent(text);}
