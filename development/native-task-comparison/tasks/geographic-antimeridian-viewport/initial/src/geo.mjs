const normalize=x=>((x+180)%360+360)%360-180;
function validate(points){for(const p of points)if(!Number.isInteger(p.lon)||p.lon< -180||p.lon>180||!Number.isInteger(p.lat)||p.lat< -90||p.lat>90)throw new RangeError('point');}
export function geographicBounds(points){validate(points);if(!points.length)return null;const longitudes=points.map(p=>normalize(p.lon)),west=Math.min(...longitudes),east=Math.max(...longitudes);return{west,east,width:east-west,south:Math.min(...points.map(p=>p.lat)),north:Math.max(...points.map(p=>p.lat)),crossesAntimeridian:false};}
export function projectPoint(point,bounds,{width,height}){
 const distance=((normalize(point.lon)-bounds.west)%360+360)%360;return{x:bounds.width===0?width/2:distance/bounds.width*width,y:bounds.north===bounds.south?height/2:(bounds.north-point.lat)/(bounds.north-bounds.south)*height};
}
