export function visitExpression(node,visitor){
 if(node.type==='literal')return visitor.literal(node.value);
 const left=visitExpression(node.left,visitor),right=visitExpression(node.right,visitor);return visitor.binary(node.op,left,right);
}
