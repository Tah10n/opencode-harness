export async function loadCatalog(fetcher){const response=await fetcher('/catalog');if(response.status!==200)throw Error('Catalog unavailable');return response.json();}
