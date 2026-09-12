export function collectTree(root,{prune=()=>false}={}){
 const output=[];function visit(node){if(node===null)return;output.push(node);if(prune(node))return;for(const child of node.children??[])visit(child);}visit(root);return output;
}
