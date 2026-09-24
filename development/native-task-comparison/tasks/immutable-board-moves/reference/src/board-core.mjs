function validate(board,from,to){
 const rows=board.length,cols=board[0].length;
 for(const point of [from,to])if(!Array.isArray(point)||point.length!==2||(!Number.isInteger(point[0])||!Number.isInteger(point[1]))||point[0]<0||point[0]>=rows||point[1]<0||point[1]>=cols)throw new RangeError('coordinate');
 if(board[from[0]][from[1]]===null)throw new Error('empty source');
 if(from[0]===to[0]&&from[1]===to[1])return;
 if(board[to[0]][to[1]]!==null)throw new Error('occupied target');
}
export function movedBoard(board,from,to){
 validate(board,from,to);const result=board.map(row=>row.slice());
 if(from[0]!==to[0]||from[1]!==to[1]){result[to[0]][to[1]]=result[from[0]][from[1]];result[from[0]][from[1]]=null;}
 return result;
}
