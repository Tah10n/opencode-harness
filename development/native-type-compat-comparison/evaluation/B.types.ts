import E, {EventEmitter} from './index';
const token: unique symbol=Symbol();
const e=new E<{message:[string,number];empty:[];[token]:[boolean]}>();
const tuple:Promise<[string,number]>=e.waitFor('message');
const empty:Promise<[]>=e.waitFor('empty',{});
const symbol:Promise<[boolean]>=e.waitFor(token,{signal:new AbortController().signal});
const fn:Promise<[string,number]>=new EventEmitter<{message:(s:string,n:number)=>void}>().waitFor('message');
new E().waitFor('anything');
type IsAny<T>=0 extends (1 & T)?true:false;
tuple.then(args=>{const check:IsAny<typeof args>=false;args[0].toUpperCase();args[1].toFixed();});
// @ts-expect-error unknown event
e.waitFor('absent');
// @ts-expect-error wrong signal
e.waitFor('empty',{signal:123});
// @ts-expect-error wrong tuple
const wrong:Promise<[number]>=e.waitFor('message');
// @ts-expect-error unsupported option
e.waitFor('empty',{timeout:100});
