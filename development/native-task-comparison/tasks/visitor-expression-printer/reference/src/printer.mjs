import {visitExpression} from './visitor.mjs';
export function printExpression(node){
 return visitExpression(node,{
 literal(value){return{text:JSON.stringify(value),precedence:3};},
 binary(op,left,right){const precedence=op==='+'||op==='-'?1:2;const l=left.precedence<precedence?'('+left.text+')':left.text,r=right.precedence<=precedence?'('+right.text+')':right.text;return{text:l+' '+op+' '+r,precedence};}
 }).text;
}
