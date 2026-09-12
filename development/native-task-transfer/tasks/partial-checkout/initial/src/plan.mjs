export function plan(stock,lines){return {accepted:lines.map((x,index)=>({...x,index})),rejected:[]};}
