export function formatRange(start,end,step=1){
 let separator=',';
 if(start!==null&&typeof start==='object'&&!Array.isArray(start)){const options=start;start=options.start===undefined?0:options.start;end=options.end;step=options.step===undefined?1:options.step;separator=options.separator===undefined?',':options.separator;}
 if(!Number.isInteger(start)||Math.abs(start)>10000||!Number.isInteger(end)||Math.abs(end)>10000||!Number.isInteger(step)||step===0||Math.abs(step)>20000)throw new RangeError('range');
 if(typeof separator!=='string')throw new TypeError('separator');
 const result=[];for(let value=start;step>0?value<=end:value>=end;value+=step)result.push(String(value===0?0:value));
 return result.join(separator);
}
