import {point} from './point.mjs';
export function transform(points,options={}){return points.map(p=>point(p,options));}
