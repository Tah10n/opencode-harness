export function message(id,payload,sequence) {
 if(typeof id!=='string'||!id.trim())throw new TypeError('id');
 return {id,payload:structuredClone(payload),sequence,status:'pending',attempts:0,lastError:null};
}
