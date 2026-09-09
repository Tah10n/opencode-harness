export function unwrap(input,fallback,{tagged=false}={}){
 if(!tagged)return input===undefined?fallback:input;
 if(input===null||typeof input!=='object'||!Object.hasOwn(input,'kind'))throw new TypeError('tagged result');
 switch(input.kind){
  case 'some':if(!Object.hasOwn(input,'value'))throw new TypeError('missing value');return input.value;
  case 'none':return fallback;
  case 'error':if(!Object.hasOwn(input,'error'))throw new TypeError('missing error');throw input.error;
  default:throw new TypeError('unknown kind');
 }
}
