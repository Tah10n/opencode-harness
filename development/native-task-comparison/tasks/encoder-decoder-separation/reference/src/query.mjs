import {encodeComponent,decodeComponent} from './component-codec.mjs';
export function renderQuery(entries){return entries.map(([key,value])=>encodeComponent(key)+'='+encodeComponent(value)).join('&');}
export function parseQuery(text){
 if(typeof text!=='string')throw new TypeError('query');if(text==='')return[];
 return text.split('&').map(part=>{const at=part.indexOf('=');if(at<0)throw new SyntaxError('missing =');return[decodeComponent(part.slice(0,at)),decodeComponent(part.slice(at+1))];});
}
