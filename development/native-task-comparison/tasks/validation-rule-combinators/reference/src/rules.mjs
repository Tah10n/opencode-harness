export function allOf(rules){
 return value=>{for(const rule of rules){const result=Reflect.apply(rule,undefined,[value]);if(!result.ok)return{ok:false,errors:[...result.errors]};}return{ok:true,errors:[]};};
}
export function anyOf(rules){
 return value=>{const errors=[];for(const rule of rules){const result=Reflect.apply(rule,undefined,[value]);if(result.ok)return{ok:true,errors:[]};for(const error of result.errors)errors.push(error);}return{ok:false,errors};};
}
