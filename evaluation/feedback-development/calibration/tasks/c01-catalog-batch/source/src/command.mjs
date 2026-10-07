import {render} from './render.mjs';
export function command(catalog,request) {
 if(request.action==='upsert')return catalog.upsert(request.product);
 if(request.action==='list')return render(catalog,request);
 throw new RangeError('action');
}
