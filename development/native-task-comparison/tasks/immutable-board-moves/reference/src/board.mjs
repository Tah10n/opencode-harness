import {movedBoard} from './board-core.mjs';
export function moveInPlace(board,from,to){
 const result=movedBoard(board,from,to);
 for(let row=0;row<board.length;row++)for(let col=0;col<board[row].length;col++)board[row][col]=result[row][col];
 return board;
}
