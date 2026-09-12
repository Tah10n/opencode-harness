export function* walkTree(root,{prune=()=>false}={}){
 if(root===null)return;const pending=[root];
 while(pending.length){const node=pending.pop();yield node;if(prune(node))continue;const children=node.children??[];for(let i=children.length-1;i>=0;i--)pending.push(children[i]);}
}
