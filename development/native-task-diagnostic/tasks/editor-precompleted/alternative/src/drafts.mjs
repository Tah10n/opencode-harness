export function drafts() {
 const staged=new Map(),published=new Map();
 return {stage(id,text){staged.set(id,text);},publish(id){if(!staged.has(id))return false;published.set(id,staged.get(id));staged.delete(id);return true;},cancel(id){return staged.delete(id);},read:()=>({staged:Object.fromEntries(staged),published:Object.fromEntries(published)})};
}
