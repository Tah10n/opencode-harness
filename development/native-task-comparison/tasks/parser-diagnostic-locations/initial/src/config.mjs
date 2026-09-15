function scanAssignments(text){
 if(typeof text!=='string')throw new TypeError('text');
 const output=[];const lines=text.split(/\r\n|\n/);
 for(let index=0;index<lines.length;index++){
  const line=lines[index];let pos=0;const ws=()=>{while(line[pos]===' '||line[pos]==='\t')pos++;};
  const fail=()=>{throw new SyntaxError('Invalid assignment at '+(index+1)+':'+(pos+1));};
  ws();if(pos===line.length||line[pos]==='#')continue;
  const keyColumn=pos+1;const key=/^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(pos));if(!key)fail();pos+=key[0].length;ws();if(line[pos]!=='=')fail();pos++;ws();const valueColumn=pos+1;
  const value=/^[A-Za-z0-9_.\/-]+/.exec(line.slice(pos));if(!value)fail();pos+=value[0].length;ws();if(pos<line.length&&line[pos]!=='#')fail();
  output.push({key:key[0],value:value[0],line:index+1,keyColumn,valueColumn});
 }
 return output;
}
export function parseConfig(text){
 const entries=scanAssignments(text),result={};
 for(const entry of entries){if(Object.hasOwn(result,entry.key))throw new SyntaxError('Duplicate key at '+entry.line+':'+entry.keyColumn);Object.defineProperty(result,entry.key,{value:entry.value,enumerable:true,writable:true,configurable:true});}
 return result;
}
