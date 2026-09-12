import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {movedBoard}=await import(path.join(root,'src/board-core.mjs'));const {moveInPlace}=await import(path.join(root,'src/board.mjs'));
test('pure move copies every row and retains piece identity',()=>{
 const piece=Object.freeze({id:'rook'}),other=Object.freeze({id:'king'});const board=Object.freeze([Object.freeze([piece,null]),Object.freeze([null,other])]),from=Object.freeze([0,0]),to=Object.freeze([1,0]);
 const moved=movedBoard(board,from,to);assert.deepEqual(moved,[[null,null],[piece,other]]);assert.equal(moved[1][0],piece);assert.notEqual(moved,board);for(let i=0;i<2;i++)assert.notEqual(moved[i],board[i]);assert.deepEqual(board,[[piece,null],[null,other]]);
 moved[0][1]='new';assert.equal(board[0][1],null);assert.deepEqual(from,[0,0]);assert.deepEqual(to,[1,0]);
 const same=movedBoard(board,[0,0],[0,0]);assert.deepEqual(same,board);assert.notEqual(same,board);assert.notEqual(same[1],board[1]);
});
test('legacy wrapper preserves container identities and failure atomicity',()=>{
 const piece={id:'p'},board=[[piece,null],[null,'q']],rows=[...board];assert.equal(moveInPlace(board,[0,0],[0,1]),board);assert.equal(board[0],rows[0]);assert.equal(board[1],rows[1]);assert.equal(board[0][1],piece);assert.deepEqual(board,[[null,piece],[null,'q']]);
 for(const [from,to,message]of [[[0,0],[1,0],'empty source'],[[0,1],[1,1],'occupied target'],[[-1,0],[1,0],'coordinate'],[[0,1],[2,0],'coordinate']]){const before=board.map(r=>r.slice());assert.throws(()=>moveInPlace(board,from,to),e=>e.message===message);assert.deepEqual(board,before);assert.equal(board[0],rows[0]);}
 assert.throws(()=>movedBoard([[null]],[0,0],[0,0]),e=>e.message==='empty source');
});

test('sparse coordinate rejects without mutation',()=>{for(const bad of [Array(2),[0,,]]){const board=[['p',null]];assert.throws(()=>movedBoard(board,bad,[0,1]),{name:'RangeError',message:'coordinate'});assert.throws(()=>moveInPlace(board,bad,[0,1]),{name:'RangeError',message:'coordinate'});assert.deepEqual(board,[['p',null]]);}});
