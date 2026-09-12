export function wrap(value){
 const promise=Promise.resolve(value);
 return {then(onValue,onError){return wrap(promise.then(onValue,onError));},catch(onError){return wrap(promise.catch(onError));},finally(onFinally){return wrap(promise.finally(onFinally));}};
}
