import {normalizeName} from './normalize.mjs';
export function validateName(raw){const name=normalizeName(raw);if(name==='')return 'empty';if(name.length>20)return 'too_long';if(!(/^[a-z][a-z0-9_-]*$/).test(name))return 'invalid';return null;}
export function displayName(raw){return '@'+normalizeName(raw);}
export function processName(raw){const error=validateName(raw);return error?{ok:false,error}:{ok:true,name:normalizeName(raw),label:displayName(raw)};}
