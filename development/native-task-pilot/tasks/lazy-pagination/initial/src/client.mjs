export async function listItems(fetchPage){let cursor;const result=[];do{const page=await fetchPage(cursor);result.push(...page.items);cursor=page.nextCursor;}while(cursor);return result;}
