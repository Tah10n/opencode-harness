import {bounds} from './search.mjs';export function locate(values,target){const {lower,upper}=bounds(values,target);return {found:upper>lower,index:lower,count:upper-lower};}
