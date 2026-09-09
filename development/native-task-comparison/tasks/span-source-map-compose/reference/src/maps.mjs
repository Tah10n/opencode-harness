const position=p=>p&&Number.isSafeInteger(p.line)&&p.line>=1&&Number.isSafeInteger(p.column)&&p.column>=0;
function validate(map){let previous=null;for(const anchor of map){if(!position(anchor.generated)||anchor.original!==null&&(!position(anchor.original)||typeof anchor.original.source!=='string')||previous&&(anchor.generated.line<previous.line||anchor.generated.line===previous.line&&anchor.generated.column<=previous.column))throw new TypeError('map');previous=anchor.generated;}}
export function lookupPosition(map,point){let found=null;for(const anchor of map){if(anchor.generated.line===point.line&&anchor.generated.column<=point.column)found=anchor;}return !found||found.original===null?null:{source:found.original.source,line:found.original.line,column:found.original.column+point.column-found.generated.column};}
export function composeMaps(outer,innerBySource){
 validate(outer);for(const map of Object.values(innerBySource))validate(map);const out=[];
 for(let i=0;i<outer.length;i++){
  const anchor=outer[i],original=anchor.original,inner=original&&Object.hasOwn(innerBySource,original.source)?innerBySource[original.source]:null;
  out.push({generated:{...anchor.generated},original:inner?lookupPosition(inner,original):original?{...original}:null});
  if(!inner)continue;const end=outer[i+1]?.generated.line===anchor.generated.line?outer[i+1].generated.column:Infinity;
  for(const boundary of inner){if(boundary.generated.line!==original.line||boundary.generated.column<=original.column)continue;const column=anchor.generated.column+boundary.generated.column-original.column;if(column>=end)continue;out.push({generated:{line:anchor.generated.line,column},original:boundary.original?{...boundary.original}:null});}
 }
 return out;
}
