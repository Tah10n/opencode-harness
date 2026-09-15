import {headings,anchors} from './headings.mjs';export function toc(text){return anchors(headings(text)).map(x=>({...x,children:[]}));}
