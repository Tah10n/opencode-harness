function tokenize(source){
 if(typeof source!=='string')throw new TypeError('source');
 const tokens=[];let i=0;
 while(i<source.length){
  if(/[ \t\r\n]/.test(source[i])){i++;continue;}
  const start=i;
  if(/[0-9]/.test(source[i])){while(i<source.length&&/[0-9]/.test(source[i]))i++;tokens.push({kind:'number',value:Number(source.slice(start,i)),start,end:i});}
  else if('+-*()'.includes(source[i])){tokens.push({kind:source[i],value:source[i],start,end:++i});}
  else throw new SyntaxError('Unexpected character at '+i);
 }
 tokens.push({kind:'eof',value:null,start:source.length,end:source.length});return tokens;
}
function parse(tokens){
 let i=0;const peek=()=>tokens[i],take=()=>tokens[i++];
 const error=()=>{throw new SyntaxError('Expected expression at '+peek().start);};
 function atom(){if(peek().kind==='number')return take().value;if(peek().kind==='('){take();const n=sum();if(peek().kind!==')')throw new SyntaxError('Expected ) at '+peek().start);take();return n;}return error();}
 function product(){let n=atom();while(peek().kind==='*'){take();n*=atom();}return n;}
 function sum(){let n=product();while(peek().kind==='+'||peek().kind==='-'){const op=take().kind;const rhs=product();n=op==='+'?n+rhs:n-rhs;}return n;}
 const n=sum();if(peek().kind!=='eof')throw new SyntaxError('Unexpected token at '+peek().start);return n;
}
export function evaluate(source){return parse(tokenize(source));}
