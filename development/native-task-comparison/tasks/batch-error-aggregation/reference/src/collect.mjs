export function collectErrors(value,rules,{firstOnly=false}={}){
 const errors=[];for(const rule of rules){const error=rule(value);if(error!==null&&error!==undefined){errors.push(error);if(firstOnly)break;}}return errors;
}
