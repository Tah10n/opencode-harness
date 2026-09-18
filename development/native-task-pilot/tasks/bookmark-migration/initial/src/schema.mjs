export function normalize(value){if(value?.version!==1||!Array.isArray(value.bookmarks))throw new TypeError('Invalid store');return {...value,bookmarks:value.bookmarks.map(x=>({...x}))};}
