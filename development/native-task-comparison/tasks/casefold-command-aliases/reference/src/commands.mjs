const valid=name=>{if(typeof name!=='string'||!(/^[A-Za-z_][A-Za-z0-9_-]*$/).test(name))throw new TypeError('command name');return name;};
const fail=code=>Object.assign(new Error(code),{code});
export function createCommands(entries){
 const exact=new Map(),aliases=new Map(),rows=[];
 for(const entry of entries){
  const name=valid(entry.name);if(exact.has(name))throw fail('DUPLICATE_COMMAND');
  const row={name,description:entry.description??'',aliases:[...(entry.aliases??[])],handler:entry.run};
  exact.set(name,row);rows.push(row);
 }
 for(const row of rows)for(const alias of row.aliases){const key=valid(alias).toLowerCase();if(aliases.has(key)&&aliases.get(key)!==row)throw fail('ALIAS_COLLISION');aliases.set(key,row);}
 return {run(name,...args){valid(name);const row=exact.get(name)??aliases.get(name.toLowerCase());if(!row)throw fail('UNKNOWN_COMMAND');return Reflect.apply(row.handler,undefined,args);},
 help(){return rows.map(({name,description,aliases})=>({name,description,aliases:[...aliases]}));}};
}
