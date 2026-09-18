export function printExpression(node){
 function render(item){if(item.type==='literal')return{text:JSON.stringify(item.value),precedence:3};const left=render(item.left),right=render(item.right),precedence=item.op==='+'||item.op==='-'?1:2;return{text:(left.precedence<precedence?'('+left.text+')':left.text)+' '+item.op+' '+(right.precedence<=precedence?'('+right.text+')':right.text),precedence};}
 return render(node).text;
}
