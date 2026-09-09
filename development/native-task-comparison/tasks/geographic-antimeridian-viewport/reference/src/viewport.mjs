import {geographicBounds,projectPoint} from './geo.mjs';
export function createViewport(points,size){
 if(!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<=0||size.height<=0||size.width>10000||size.height>10000)throw new RangeError('size');
 const bounds=geographicBounds(points);return{bounds,markers:points.map(point=>({id:point.id,...projectPoint(point,bounds,size)}))};
}
