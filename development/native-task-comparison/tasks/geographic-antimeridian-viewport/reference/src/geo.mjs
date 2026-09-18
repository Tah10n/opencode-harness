const normalize=x=>((x+180)%360+360)%360-180;
function validate(points){for(const p of points)if(!Number.isInteger(p.lon)||p.lon< -180||p.lon>180||!Number.isInteger(p.lat)||p.lat< -90||p.lat>90)throw new RangeError('point');}
export function geographicBounds(points){
 validate(points);if(!points.length)return null;const longitudes=[...new Set(points.map(p=>normalize(p.lon)))].sort((a,b)=>a-b);let width=Infinity,west=0;
 for(let i=0;i<longitudes.length;i++){const next=longitudes[(i+1)%longitudes.length],gap=(i===longitudes.length-1?next+360:next)-longitudes[i],span=360-gap;if(span<width||span===width&&next<west){width=span;west=next;}}
 const east=normalize(west+width);return{west,east,width,south:Math.min(...points.map(p=>p.lat)),north:Math.max(...points.map(p=>p.lat)),crossesAntimeridian:width>0&&west>east};
}
export function projectPoint(point,bounds,{width,height}){
 const distance=((normalize(point.lon)-bounds.west)%360+360)%360;return{x:bounds.width===0?width/2:distance/bounds.width*width,y:bounds.north===bounds.south?height/2:(bounds.north-point.lat)/(bounds.north-bounds.south)*height};
}
