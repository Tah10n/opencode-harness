import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {tokenize}=await import(path.join(root,'src/lexer.mjs'));const {evaluate}=await import(path.join(root,'src/evaluate.mjs'));
test('public token values and original UTF16 spans',()=>{
 assert.deepEqual(tokenize(' \t12 +\n(03*4)-5 '),[
 {kind:'number',value:12,start:2,end:4},{kind:'+',value:'+',start:5,end:6},{kind:'(',value:'(',start:7,end:8},{kind:'number',value:3,start:8,end:10},{kind:'*',value:'*',start:10,end:11},{kind:'number',value:4,start:11,end:12},{kind:')',value:')',start:12,end:13},{kind:'-',value:'-',start:13,end:14},{kind:'number',value:5,start:14,end:15},{kind:'eof',value:null,start:16,end:16}]);
 assert.deepEqual(tokenize(' \r\n'),[{kind:'eof',value:null,start:3,end:3}]);
 const t=tokenize('7');t[0].value=99;assert.equal(tokenize('7')[0].value,7);
});
test('precedence and exact lexical/parser errors',()=>{
 for(const [text,value]of [['2+3*4',14],['(2+3)*4',20],['9-3-2',4],['0007',7],['2*(4-8)+3',-5]])assert.equal(evaluate(text),value);
 for(const [text,message]of [['2 3 @','Unexpected character at 4'],['2+@','Unexpected character at 2'],['2 @ +','Unexpected character at 2'],['2+','Expected expression at 2'],['','Expected expression at 0'],['(2+3','Expected ) at 4'],['2 3','Unexpected token at 2'],['-2','Expected expression at 0'],['2/3','Unexpected character at 1'],['2+\u00a03','Unexpected character at 2'],['2+😀','Unexpected character at 2']])assert.throws(()=>evaluate(text),e=>e instanceof SyntaxError&&e.message===message);
 assert.throws(()=>tokenize('2😀'),e=>e instanceof SyntaxError&&e.message==='Unexpected character at 1');
 for(const input of [null,{},2])assert.throws(()=>tokenize(input),TypeError);
});
