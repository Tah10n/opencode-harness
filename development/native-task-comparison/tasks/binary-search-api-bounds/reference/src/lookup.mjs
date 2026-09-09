import {bounds} from './search.mjs';
export function locate(values,target,options){const {lower,upper}=bounds(values,target,options);return {found:upper>lower,index:lower,count:upper-lower};}
