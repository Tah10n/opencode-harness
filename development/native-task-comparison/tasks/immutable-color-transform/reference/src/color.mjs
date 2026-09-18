import {parseColor,shiftColor,formatColor} from './color-core.mjs';
export function adjustColor(text,amount){return formatColor(shiftColor(parseColor(text),amount));}
