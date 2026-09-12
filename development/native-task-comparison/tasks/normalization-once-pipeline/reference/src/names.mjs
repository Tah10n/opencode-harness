import {normalizeName} from './normalize.mjs';
import {validateNormalized,displayNormalized} from './name-core.mjs';
export function validateName(raw){return validateNormalized(normalizeName(raw));}
export function displayName(raw){return displayNormalized(normalizeName(raw));}
export function processName(raw,{normalize=normalizeName}={}){
 const name=normalize(raw),error=validateNormalized(name);
 return error?{ok:false,error}:{ok:true,name,label:displayNormalized(name)};
}
