export function listNames(lookup,ids,callback){const names=[];let index=0;function next(){if(index===ids.length)return callback(null,names);lookup(ids[index++],(err,user)=>{if(err)return callback(err);names.push(user.name);next();});}next();}
export async function listNamesAsync(lookup,ids){const values=await Promise.all(ids.map(id=>lookup(id)));return values.map(x=>x.name);}
