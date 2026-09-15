import {kitCapacity} from './kits.mjs';export function quote(stock,kits){return kits.map(k=>({id:k.id,available:kitCapacity(stock,k.parts)}));}
