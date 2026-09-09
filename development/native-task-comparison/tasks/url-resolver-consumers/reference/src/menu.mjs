import {resolveLink} from './resolve.mjs';
export function buildMenu(base,items){resolveLink(base,'');return items.map(item=>({label:item.label,href:resolveLink(base,item.href)}));}
