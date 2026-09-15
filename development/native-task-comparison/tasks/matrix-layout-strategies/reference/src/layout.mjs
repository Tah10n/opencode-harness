import {cellOrder} from './cell-order.mjs';
export function layout(items,{rows,cols,order='row'}){
 const cells=cellOrder(rows,cols,order),grid=Array.from({length:rows},()=>Array(cols).fill(null));
 for(const item of items){let placed=false;for(const [r,c]of cells){if(r+item.h>rows||c+item.w>cols)continue;let fits=true;for(let y=r;y<r+item.h;y++)for(let x=c;x<c+item.w;x++)if(grid[y][x]!==null)fits=false;if(!fits)continue;for(let y=r;y<r+item.h;y++)for(let x=c;x<c+item.w;x++)grid[y][x]=item.id;placed=true;break;}if(!placed)throw new RangeError('cannot place '+item.id);}
 return grid;
}
export function renderLayout(grid){return grid.map(row=>row.map(cell=>cell??'.').join(' ')).join('\n');}
