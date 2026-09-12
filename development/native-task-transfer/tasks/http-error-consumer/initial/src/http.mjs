export async function request(fetcher,url,options={}){const r=await fetcher(url,options);return r.json();}
