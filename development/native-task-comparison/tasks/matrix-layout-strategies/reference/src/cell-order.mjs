export function cellOrder(rows,cols,order='row'){
 if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows>50||cols>50||!['row','column'].includes(order))throw new TypeError('layout');
 const cells=[];if(order==='row'){for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)cells.push([r,c]);}else{for(let c=0;c<cols;c++)for(let r=0;r<rows;r++)cells.push([r,c]);}return cells;
}
