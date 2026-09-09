import {request} from './http.mjs';export function findUser(fetcher,base,id,options={}){return request(fetcher,base+'/users/'+id,options);}
