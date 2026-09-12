export function formatRange(start,end,step=1){const result=[];for(let v=start;step>0?v<=end:v>=end;v+=step)result.push(String(v));return result.join(',');}
