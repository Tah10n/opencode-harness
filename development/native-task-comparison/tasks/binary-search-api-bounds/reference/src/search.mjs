export function bounds(values,target,{compare=(a,b)=>a-b,key=x=>x}={}){
 function boundary(upper){let low=0,high=values.length;while(low<high){const mid=low+Math.floor((high-low)/2),c=compare(key(values[mid]),target);if(c<0||(upper&&c===0))low=mid+1;else high=mid;}return low;}
 return {lower:boundary(false),upper:boundary(true)};
}
