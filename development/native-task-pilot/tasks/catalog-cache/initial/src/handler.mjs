import {selectCatalog} from './select.mjs';
export function handle(req,res,catalog){if(req.method!=='GET'){res.writeHead(405);res.end();return;}if(new URL(req.url,'http://localhost').pathname!=='/catalog'){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(selectCatalog(catalog)));}
