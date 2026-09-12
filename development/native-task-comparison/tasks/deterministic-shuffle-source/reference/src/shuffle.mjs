import {shuffleWithRandom} from './shuffle-core.mjs';
export function shuffle(values,{random=Math.random}={}){return shuffleWithRandom(values,random);}
