export function runs(values){const out=[];for(const value of values){const last=out.at(-1);if(last&&last.value===value)last.count++;else out.push({value,count:1});}return out;}
